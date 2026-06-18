import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminToken, verifyPassword } from '@/lib/admin';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const password = form?.get('password');

  if (typeof password !== 'string' || !verifyPassword(password)) {
    return NextResponse.redirect(new URL('/admin?error=1', req.url), 303);
  }

  const res = NextResponse.redirect(new URL('/admin', req.url), 303);
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return res;
}
