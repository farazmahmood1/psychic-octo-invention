/**
 * Seed script — creates initial super_admin user.
 * Run with: npx tsx scripts/seed-admin.ts
 *
 * Requires DATABASE_URL and ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD in env.
 */

import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env['ADMIN_SEED_EMAIL'];
  const password = process.env['ADMIN_SEED_PASSWORD'];

  if (!email || !password) {
    console.error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in environment.');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('ADMIN_SEED_PASSWORD must be at least 12 characters.');
    process.exit(1);
  }

  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.admin.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    console.log(`[seed] Admin user already exists: ${normalizedEmail} (id: ${existing.id})`);
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const admin = await prisma.admin.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      role: 'super_admin',
      displayName: 'System Admin',
    },
  });

  console.log(`[seed] Created admin user: ${admin.email} (id: ${admin.id}, role: ${admin.role})`);
}

main()
  .catch((err) => {
    console.error('[seed] Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
