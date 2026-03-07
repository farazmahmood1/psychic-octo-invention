/** Admin roles for RBAC — mirrors Prisma AdminRole enum */
export type AdminRole = 'super_admin' | 'admin' | 'viewer';

/** Session user payload stored in the session cookie */
export interface SessionUser {
  id: string;
  email: string;
  role: AdminRole;
  displayName: string | null;
}

/** Login request payload */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Login response */
export interface LoginResponse {
  user: SessionUser;
}

/** Change password request payload */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

/** Auth me response */
export interface AuthMeResponse {
  user: SessionUser;
}

/** RBAC permission levels: super_admin > admin > viewer */
export const ROLE_HIERARCHY: Record<AdminRole, number> = {
  super_admin: 3,
  admin: 2,
  viewer: 1,
};
