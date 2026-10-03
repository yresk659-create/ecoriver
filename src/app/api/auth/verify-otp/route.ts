import { NextResponse } from 'next/server';
import {
  assertSameOrigin,
  completeLogin,
  completeSignup,
  expiredCookieOptions,
  otpInputSchema,
  PENDING_LOGIN_COOKIE_NAME,
  PENDING_SIGNUP_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  toPublicAuthError,
} from '@/lib/server/auth';
import { readRequestCookie } from '@/lib/server/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body request harus berupa JSON.' }, { status: 400 });
  }

  const parsed = otpInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Kode OTP tidak valid.' },
      { status: 400 }
    );
  }

  const signupToken = readRequestCookie(request, PENDING_SIGNUP_COOKIE_NAME);
  const loginToken = readRequestCookie(request, PENDING_LOGIN_COOKIE_NAME);
  const purpose =
    parsed.data.purpose ??
    (signupToken && !loginToken ? 'signup' : loginToken && !signupToken ? 'login' : undefined);

  if (!purpose) {
    return NextResponse.json(
      { error: 'Tujuan verifikasi tidak ditemukan. Mulai proses masuk atau pendaftaran kembali.' },
      { status: 400 }
    );
  }

  try {
    assertSameOrigin(request);
    const result =
      purpose === 'signup'
        ? await completeSignup(signupToken, parsed.data.code, request.headers)
        : await completeLogin(loginToken, parsed.data.code, request.headers);
    const response = NextResponse.json({ user: result.user, sessionStatus: result.sessionStatus });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      result.sessionToken,
      sessionCookieOptions(result.sessionExpiresAt)
    );
    if (purpose === 'signup') {
      response.cookies.set(PENDING_SIGNUP_COOKIE_NAME, '', expiredCookieOptions());
      response.cookies.set(PENDING_LOGIN_COOKIE_NAME, '', expiredCookieOptions());
    } else {
      response.cookies.set(PENDING_LOGIN_COOKIE_NAME, '', expiredCookieOptions());
      response.cookies.set(PENDING_SIGNUP_COOKIE_NAME, '', expiredCookieOptions());
    }
    return response;
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
