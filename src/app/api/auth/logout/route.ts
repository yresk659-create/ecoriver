import { NextResponse } from 'next/server';
import {
  assertSameOrigin,
  expiredCookieOptions,
  revokeCurrentSession,
  SESSION_COOKIE_NAME,
  toPublicAuthError,
} from '@/lib/server/auth';
import { readRequestCookie } from '@/lib/server/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await revokeCurrentSession(readRequestCookie(request, SESSION_COOKIE_NAME));
    const response = NextResponse.json({ message: 'Logout berhasil.' });
    response.cookies.set(SESSION_COOKIE_NAME, '', expiredCookieOptions());
    return response;
  } catch (error) {
    const publicError = toPublicAuthError(error);
    const response = NextResponse.json({ error: publicError.message }, { status: publicError.status });
    response.cookies.set(SESSION_COOKIE_NAME, '', expiredCookieOptions());
    return response;
  }
}
