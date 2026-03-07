import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { authConfig } from '@openclaw/config';
import type { SessionUser } from '@openclaw/shared';
import { adminRepository } from '../repositories/admin.repository.js';
import { sessionRepository } from '../repositories/session.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { AppError } from '../utils/app-error.js';

const GENERIC_AUTH_ERROR = 'Invalid email or password';

function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hash of session token for DB storage — protects against DB leak */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateCsrfToken(): string {
  return randomBytes(24).toString('hex');
}

function toSessionUser(admin: {
  id: string;
  email: string;
  role: string;
  displayName: string | null;
}): SessionUser {
  return {
    id: admin.id,
    email: admin.email,
    role: admin.role as SessionUser['role'],
    displayName: admin.displayName,
  };
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

interface LoginResult {
  sessionToken: string;
  csrfToken: string;
  user: SessionUser;
}

export async function login(
  email: string,
  password: string,
  ip: string,
  userAgent: string,
): Promise<LoginResult> {
  const admin = await adminRepository.findByEmail(email);

  if (!admin || !admin.isActive) {
    await logAuthEvent('auth.login_failed', null, ip, userAgent, { reason: 'invalid_credentials' });
    throw new AppError(401, 'INVALID_CREDENTIALS', GENERIC_AUTH_ERROR);
  }

  const valid = await verifyPassword(admin.passwordHash, password);
  if (!valid) {
    await logAuthEvent('auth.login_failed', admin.id, ip, userAgent, { reason: 'invalid_password' });
    throw new AppError(401, 'INVALID_CREDENTIALS', GENERIC_AUTH_ERROR);
  }

  const sessionToken = generateSessionToken();
  const csrfToken = generateCsrfToken();
  const hashedToken = hashToken(sessionToken);
  const expiresAt = new Date(Date.now() + authConfig.session.maxAge);

  await sessionRepository.create({
    adminId: admin.id,
    token: hashedToken,
    ipAddress: ip,
    userAgent,
    expiresAt,
  });

  await adminRepository.updateLastLogin(admin.id, ip);
  await logAuthEvent('auth.login_success', admin.id, ip, userAgent);

  return {
    sessionToken,
    csrfToken,
    user: toSessionUser(admin),
  };
}

export async function logout(sessionToken: string, ip: string, userAgent: string): Promise<void> {
  const hashedToken = hashToken(sessionToken);
  const session = await sessionRepository.findByToken(hashedToken);

  if (session) {
    await sessionRepository.deleteByToken(hashedToken);
    await logAuthEvent('auth.logout', session.adminId, ip, userAgent);
  }
}

export async function validateSession(
  sessionToken: string,
): Promise<SessionUser | null> {
  const hashedToken = hashToken(sessionToken);
  const session = await sessionRepository.findByToken(hashedToken);

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await sessionRepository.deleteByToken(hashedToken);
    }
    return null;
  }

  if (!session.admin.isActive) {
    await sessionRepository.deleteByToken(hashedToken);
    return null;
  }

  return toSessionUser(session.admin);
}

export async function changePassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
  ip: string,
  userAgent: string,
): Promise<void> {
  const admin = await adminRepository.findById(adminId);
  if (!admin) {
    throw new AppError(404, 'NOT_FOUND', 'Admin not found');
  }

  const valid = await verifyPassword(admin.passwordHash, currentPassword);
  if (!valid) {
    await logAuthEvent('auth.password_change_failed', adminId, ip, userAgent, {
      reason: 'invalid_current_password',
    });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }

  const newHash = await hashPassword(newPassword);
  await adminRepository.updatePasswordHash(adminId, newHash);

  // Invalidate all other sessions for this admin
  await sessionRepository.deleteAllForAdmin(adminId);

  await logAuthEvent('auth.password_changed', adminId, ip, userAgent);
}

/** Constant-time CSRF token comparison */
export function verifyCsrfToken(cookieToken: string, headerToken: string): boolean {
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;
  return timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
}

async function logAuthEvent(
  action: string,
  actorId: string | null,
  ip: string,
  userAgent: string,
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await auditRepository.create({
      actorId,
      actorType: 'admin',
      action,
      targetType: 'auth',
      ipAddress: ip,
      userAgent,
      ...(metadata ? { metadata } : {}),
    });
  } catch {
    // Audit log failure should not break auth flow
  }
}
