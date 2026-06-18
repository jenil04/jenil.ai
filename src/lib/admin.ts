import { createHash, timingSafeEqual } from 'node:crypto';
import { getAdminPassword } from './config';

/** Opaque session value derived from the admin password (rotates if it changes). */
export function adminToken(): string {
  return createHash('sha256').update(getAdminPassword()).digest('hex');
}

export const ADMIN_COOKIE = 'jenil_admin';

/** Constant-time check of a session cookie against the current admin token. */
export function checkAdmin(cookieVal: string | undefined): boolean {
  if (!cookieVal) return false;
  try {
    const a = Buffer.from(cookieVal);
    const b = Buffer.from(adminToken());
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Verify a submitted password in constant time. */
export function verifyPassword(submitted: string): boolean {
  try {
    const a = Buffer.from(submitted);
    const b = Buffer.from(getAdminPassword());
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
