import { NextResponse } from 'next/server';
import {
  assertSameOrigin,
  expiredCookieOptions,
  loginInputSchema,
  PENDING_LOGIN_COOKIE_NAME,
  PENDING_SIGNUP_COOKIE_NAME,
  pendingSignupCookieOptions,
  startLogin,
  toPublicAuthError,
} from '@/lib/server/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body request harus berupa JSON.' }, { status: 400 });
  }

  const parsed = loginInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Data login tidak valid.' },
      { status: 400 }
    );
  }

  try {
    assertSameOrigin(request);
    const result = await startLogin(parsed.data, request.headers);
    const response = NextResponse.json({
      message: 'Kode OTP telah dikirim ke email Anda.',
      expiresAt: result.otpExpiresAt.toISOString(),
      destination: result.destination,
    });
    response.cookies.set(
      PENDING_LOGIN_COOKIE_NAME,
      result.pendingToken,
      pendingSignupCookieOptions(result.pendingExpiresAt)
    );
    response.cookies.set(PENDING_SIGNUP_COOKIE_NAME, '', expiredCookieOptions());
    return response;
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
