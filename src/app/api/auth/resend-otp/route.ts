import { NextResponse } from 'next/server';
import {
  assertSameOrigin,
  PENDING_LOGIN_COOKIE_NAME,
  PENDING_SIGNUP_COOKIE_NAME,
  resendLoginOtp,
  resendOtpInputSchema,
  resendSignupOtp,
  toPublicAuthError,
} from '@/lib/server/auth';
import { readOptionalJson, readRequestCookie } from '@/lib/server/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const parsed = resendOtpInputSchema.safeParse((await readOptionalJson(request)) ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Permintaan OTP tidak valid.' },
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
        ? await resendSignupOtp(signupToken, request.headers)
        : await resendLoginOtp(loginToken, request.headers);
    return NextResponse.json({
      message: 'Kode OTP baru telah dikirim.',
      expiresAt: result.otpExpiresAt.toISOString(),
      destination: result.destination,
    });
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
