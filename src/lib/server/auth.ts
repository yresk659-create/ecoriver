import 'server-only';

import bcrypt from 'bcryptjs';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { ServerConfigurationError, isProduction, requireServerEnv } from './config';
import { getDatabasePool, withTransaction } from './db';
import { sendOtpEmail } from './email';

const OTP_TTL_MS = 5 * 60 * 1000;
const PENDING_SIGNUP_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_PER_EMAIL_WINDOW = 3;
const MAX_OTP_PER_IP_WINDOW = 10;
const MAX_LOGIN_PER_IDENTIFIER_WINDOW = 5;
const MAX_LOGIN_PER_IP_WINDOW = 20;

export const SESSION_COOKIE_NAME = 'riverwatch_session';
export const PENDING_SIGNUP_COOKIE_NAME = 'riverwatch_pending_signup';
export const PENDING_LOGIN_COOKIE_NAME = 'riverwatch_pending_login';

export class AuthError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

function normalizeNama(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export const signupInputSchema = z
  .object({
    nama: z
      .string()
      .trim()
      .min(2, 'Nama minimal 2 karakter.')
      .max(100, 'Nama maksimal 100 karakter.')
      .transform(normalizeNama),
    email: z
      .string()
      .trim()
      .email('Format email tidak valid.')
      .max(320, 'Email terlalu panjang.')
      .transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(8, 'Password minimal 8 karakter.')
      .max(128, 'Password maksimal 128 karakter.')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
        'Password harus mengandung huruf kapital, kecil, dan angka.'
      ),
  })
  .strict();

export const otpInputSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/, 'OTP harus terdiri dari 6 digit.'),
    purpose: z.enum(['signup', 'login']).optional(),
  })
  .strict();

export const resendOtpInputSchema = z
  .object({
    purpose: z.enum(['signup', 'login']).optional(),
  })
  .strict();

export const loginInputSchema = z
  .object({
    nama: z
      .string()
      .trim()
      .min(2, 'Nama minimal 2 karakter.')
      .max(100, 'Nama maksimal 100 karakter.')
      .transform(normalizeNama),
    password: z
      .string()
      .min(1, 'Password wajib diisi.')
      .max(128, 'Password maksimal 128 karakter.'),
  })
  .strict();

export type SignupInput = z.infer<typeof signupInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;

export type AuthSessionStatus = 'owner' | 'pending' | 'allowed';

export interface PublicAuthUser {
  id: string;
  nama: string;
  email: string;
  role: 'owner' | 'operator' | 'viewer';
  isOwner: boolean;
  createdAt: string;
  currentDevice: string;
}

interface StartSignupResult {
  pendingToken: string;
  pendingExpiresAt: Date;
  otpExpiresAt: Date;
  destination: string;
}

interface StartLoginResult {
  pendingToken: string;
  pendingExpiresAt: Date;
  otpExpiresAt: Date;
  destination: string;
}

interface CompleteSignupResult {
  sessionToken: string;
  sessionExpiresAt: Date;
  user: PublicAuthUser;
  sessionStatus: 'owner';
}

interface CompleteLoginResult {
  sessionToken: string;
  sessionExpiresAt: Date;
  user: PublicAuthUser;
  sessionStatus: AuthSessionStatus;
}

interface PendingSignupRow {
  id: string;
  nama: string;
  nama_normalized: string;
  email: string;
  email_normalized: string;
  password_hash: string;
  expires_at: Date;
}

interface OtpRow {
  id: string;
  code_hash: string;
  expires_at: Date;
  attempts: number;
}

interface LoginUserRow {
  id: string;
  account_id: string;
  nama: string;
  email: string;
  email_normalized: string;
  password_hash: string;
  role: 'owner' | 'operator' | 'viewer';
  created_at: Date;
}

interface LoginOtpRow extends OtpRow {
  user_id: string;
  account_id: string;
  nama: string;
  email: string;
  email_normalized: string;
  role: 'owner' | 'operator' | 'viewer';
  created_at: Date;
}

export interface CurrentAuthSession {
  user: PublicAuthUser;
  sessionStatus: AuthSessionStatus;
  accountId: string;
  sessionId: string;
}

export interface PublicSession {
  id: string;
  userId: string;
  deviceName: string;
  browser: string;
  os: string;
  location: string;
  status: AuthSessionStatus | 'blocked' | 'revoked';
  lastActive: string;
  isCurrentDevice: boolean;
}

export interface PublicNotification {
  id: string;
  type: 'new_login' | 'login_allowed' | 'device_logout' | 'alert' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  sessionId?: string;
  actionRequired?: boolean;
  deviceInfo?: string;
  location?: string;
}

type CompleteSignupTransactionResult =
  | { kind: 'success'; user: PublicAuthUser }
  | { kind: 'otp_error'; status: 400 | 429; message: string };

type CompleteLoginTransactionResult =
  | { kind: 'success'; user: PublicAuthUser; sessionStatus: AuthSessionStatus }
  | { kind: 'otp_error'; status: 400 | 429; message: string };

function hashOpaqueToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashOtp(purpose: 'signup' | 'login', code: string): string {
  return createHmac('sha256', requireServerEnv('OTP_PEPPER'))
    .update(`${purpose}:${code}`)
    .digest('hex');
}

function hashIp(ip: string): string | null {
  if (!ip || ip === 'unknown') return null;
  return createHmac('sha256', requireServerEnv('OTP_PEPPER')).update(`ip:${ip}`).digest('hex');
}

function hashLoginIdentifier(namaNormalized: string): string {
  return createHmac('sha256', requireServerEnv('OTP_PEPPER'))
    .update(`login-identifier:${namaNormalized}`)
    .digest('hex');
}

function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function securelyMatches(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return 'email Anda';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function getRequestIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
  return candidate.slice(0, 64) || 'unknown';
}

function getDeviceInfo(headers: Headers): { device: string; browser: string; os: string } {
  const userAgent = headers.get('user-agent') || '';
  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('Firefox/')
      ? 'Firefox'
      : userAgent.includes('Safari/') && !userAgent.includes('Chrome/')
        ? 'Safari'
        : userAgent.includes('Chrome/') || userAgent.includes('CriOS/')
          ? 'Chrome'
          : 'Unknown browser';
  const os = userAgent.includes('Windows')
    ? 'Windows'
    : userAgent.includes('Android')
      ? 'Android'
      : userAgent.includes('iPhone') || userAgent.includes('iPad')
        ? 'iOS'
        : userAgent.includes('Mac OS X')
          ? 'macOS'
          : userAgent.includes('Linux')
            ? 'Linux'
            : 'Unknown OS';

  return { device: `${browser} / ${os}`, browser, os };
}

function normalizeError(error: unknown): { status: number; message: string } {
  if (error instanceof AuthError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof ServerConfigurationError) {
    return { status: 503, message: 'Konfigurasi autentikasi server belum lengkap.' };
  }
  return { status: 500, message: 'Terjadi gangguan pada server. Silakan coba lagi.' };
}

export function toPublicAuthError(error: unknown): { status: number; message: string } {
  return normalizeError(error);
}

export function pendingSignupCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function expiredCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax' as const,
    path: '/',
    expires: new Date(0),
  };
}

async function enforceOtpRateLimit(
  client: PoolClient,
  purpose: 'signup' | 'login',
  emailNormalized: string,
  requestIpHash: string | null
): Promise<void> {
  const result = await client.query<{ email_count: string; ip_count: string }>(
    `SELECT
      COUNT(*) FILTER (
        WHERE email_normalized = $1
          AND created_at > NOW() - INTERVAL '15 minutes'
      ) AS email_count,
      COUNT(*) FILTER (
        WHERE request_ip_hash = $2
          AND created_at > NOW() - INTERVAL '15 minutes'
      ) AS ip_count
     FROM public.otp_codes
     WHERE purpose = $3`,
    [emailNormalized, requestIpHash, purpose]
  );
  const counts = result.rows[0];
  const emailCount = Number(counts?.email_count ?? 0);
  const ipCount = requestIpHash ? Number(counts?.ip_count ?? 0) : 0;

  if (emailCount >= MAX_OTP_PER_EMAIL_WINDOW || ipCount >= MAX_OTP_PER_IP_WINDOW) {
    throw new AuthError(429, 'Terlalu banyak permintaan OTP. Coba lagi dalam 15 menit.');
  }
}

async function enforceLoginRateLimit(
  client: PoolClient,
  identifierHash: string,
  requestIpHash: string | null
): Promise<void> {
  const result = await client.query<{ identifier_count: string; ip_count: string }>(
    `SELECT
      COUNT(*) FILTER (
        WHERE identifier_hash = $1
          AND created_at > NOW() - INTERVAL '15 minutes'
      ) AS identifier_count,
      COUNT(*) FILTER (
        WHERE request_ip_hash = $2
          AND created_at > NOW() - INTERVAL '15 minutes'
      ) AS ip_count
     FROM public.auth_login_attempts`,
    [identifierHash, requestIpHash]
  );
  const counts = result.rows[0];
  const identifierCount = Number(counts?.identifier_count ?? 0);
  const ipCount = requestIpHash ? Number(counts?.ip_count ?? 0) : 0;

  if (
    identifierCount >= MAX_LOGIN_PER_IDENTIFIER_WINDOW ||
    ipCount >= MAX_LOGIN_PER_IP_WINDOW
  ) {
    throw new AuthError(429, 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.');
  }
}

export async function startSignup(
  input: SignupInput,
  headers: Headers
): Promise<StartSignupResult> {
  const namaNormalized = input.nama.toLocaleLowerCase('id-ID');
  const passwordHash = await bcrypt.hash(input.password, 12);
  const otpCode = generateOtp();
  const pendingToken = randomBytes(32).toString('base64url');
  const now = Date.now();
  const otpExpiresAt = new Date(now + OTP_TTL_MS);
  const pendingExpiresAt = new Date(now + PENDING_SIGNUP_TTL_MS);
  const requestIpHash = hashIp(getRequestIp(headers));

  const pendingId = await withTransaction(async (client) => {
    await client.query('DELETE FROM public.pending_signups WHERE expires_at <= NOW()');

    const existingUser = await client.query(
      `SELECT id FROM public.users
       WHERE email_normalized = $1 OR nama_normalized = $2
       LIMIT 1`,
      [input.email, namaNormalized]
    );
    if (existingUser.rowCount) {
      throw new AuthError(409, 'Nama atau email sudah digunakan.');
    }

    await enforceOtpRateLimit(client, 'signup', input.email, requestIpHash);

    const pending = await client.query<{ id: string }>(
      `INSERT INTO public.pending_signups (
        nama,
        nama_normalized,
        email,
        email_normalized,
        password_hash,
        challenge_token_hash,
        expires_at
      )
      VALUES ($1, $2, $3, $3, $4, $5, $6)
      ON CONFLICT (email_normalized) DO UPDATE
      SET nama = EXCLUDED.nama,
          nama_normalized = EXCLUDED.nama_normalized,
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          challenge_token_hash = EXCLUDED.challenge_token_hash,
          created_at = NOW(),
          expires_at = EXCLUDED.expires_at
      RETURNING id`,
      [
        input.nama,
        namaNormalized,
        input.email,
        passwordHash,
        hashOpaqueToken(pendingToken),
        pendingExpiresAt,
      ]
    );
    const id = pending.rows[0]?.id;
    if (!id) throw new Error('Pending signup tidak dapat dibuat.');

    await client.query(
      `UPDATE public.otp_codes
       SET invalidated_at = NOW()
       WHERE pending_signup_id = $1
         AND purpose = 'signup'
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [id]
    );
    await client.query(
      `INSERT INTO public.otp_codes (
        pending_signup_id,
        purpose,
        email_normalized,
        code_hash,
        request_ip_hash,
        expires_at
      )
      VALUES ($1, 'signup', $2, $3, $4, $5)`,
      [id, input.email, hashOtp('signup', otpCode), requestIpHash, otpExpiresAt]
    );

    return id;
  });

  try {
    await sendOtpEmail(input.email, input.nama, otpCode);
  } catch (error) {
    await getDatabasePool().query(
      `UPDATE public.otp_codes
       SET invalidated_at = NOW()
       WHERE pending_signup_id = $1
         AND purpose = 'signup'
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [pendingId]
    );
    if (error instanceof ServerConfigurationError) throw error;
    throw new AuthError(502, 'Kode verifikasi belum dapat dikirim. Silakan coba lagi.');
  }

  return {
    pendingToken,
    pendingExpiresAt,
    otpExpiresAt,
    destination: maskEmail(input.email),
  };
}

export async function resendSignupOtp(
  pendingToken: string | undefined,
  headers: Headers
): Promise<Pick<StartSignupResult, 'otpExpiresAt' | 'destination'>> {
  if (!pendingToken) {
    throw new AuthError(400, 'Sesi verifikasi tidak ditemukan. Daftar kembali untuk meminta OTP baru.');
  }

  const otpCode = generateOtp();
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  const pendingExpiresAt = new Date(Date.now() + PENDING_SIGNUP_TTL_MS);
  const requestIpHash = hashIp(getRequestIp(headers));

  const pending = await withTransaction(async (client) => {
    const selected = await client.query<PendingSignupRow>(
      `SELECT id, nama, nama_normalized, email, email_normalized, password_hash, expires_at
       FROM public.pending_signups
       WHERE challenge_token_hash = $1
       FOR UPDATE`,
      [hashOpaqueToken(pendingToken)]
    );
    const row = selected.rows[0];
    if (!row || row.expires_at <= new Date()) {
      throw new AuthError(400, 'Sesi verifikasi sudah kedaluwarsa. Daftar kembali untuk meminta OTP baru.');
    }

    await enforceOtpRateLimit(client, 'signup', row.email_normalized, requestIpHash);
    await client.query(
      `UPDATE public.otp_codes
       SET invalidated_at = NOW()
       WHERE pending_signup_id = $1
         AND purpose = 'signup'
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [row.id]
    );
    await client.query(
      `UPDATE public.pending_signups
       SET expires_at = $2
       WHERE id = $1`,
      [row.id, pendingExpiresAt]
    );
    await client.query(
      `INSERT INTO public.otp_codes (
        pending_signup_id,
        purpose,
        email_normalized,
        code_hash,
        request_ip_hash,
        expires_at
      )
      VALUES ($1, 'signup', $2, $3, $4, $5)`,
      [row.id, row.email_normalized, hashOtp('signup', otpCode), requestIpHash, otpExpiresAt]
    );
    return row;
  });

  try {
    await sendOtpEmail(pending.email, pending.nama, otpCode);
  } catch (error) {
    await getDatabasePool().query(
      `UPDATE public.otp_codes
       SET invalidated_at = NOW()
       WHERE pending_signup_id = $1
         AND purpose = 'signup'
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [pending.id]
    );
    if (error instanceof ServerConfigurationError) throw error;
    throw new AuthError(502, 'Kode verifikasi belum dapat dikirim. Silakan coba lagi.');
  }

  return { otpExpiresAt, destination: maskEmail(pending.email) };
}

/**
 * Starts the second factor for a password login. The opaque challenge token is
 * kept only in an HttpOnly cookie; the database receives its SHA-256 hash.
 */
export async function startLogin(
  input: LoginInput,
  headers: Headers
): Promise<StartLoginResult> {
  const namaNormalized = input.nama.toLocaleLowerCase('id-ID');
  const otpCode = generateOtp();
  const pendingToken = randomBytes(32).toString('base64url');
  const pendingTokenHash = hashOpaqueToken(pendingToken);
  const now = Date.now();
  const otpExpiresAt = new Date(now + OTP_TTL_MS);
  const requestIpHash = hashIp(getRequestIp(headers));

  const outcome = await withTransaction(async (client) => {
    await enforceLoginRateLimit(client, hashLoginIdentifier(namaNormalized), requestIpHash);

    const userResult = await client.query<LoginUserRow>(
      `SELECT id, account_id, nama, email, email_normalized, password_hash, role, created_at
       FROM public.users
       WHERE nama_normalized = $1
       LIMIT 1
       FOR UPDATE`,
      [namaNormalized]
    );
    const user = userResult.rows[0];
    const passwordMatches = user ? await bcrypt.compare(input.password, user.password_hash) : false;

    await client.query(
      `INSERT INTO public.auth_login_attempts (identifier_hash, request_ip_hash, succeeded)
       VALUES ($1, $2, $3)`,
      [hashLoginIdentifier(namaNormalized), requestIpHash, passwordMatches]
    );

    if (!user || !passwordMatches) return { kind: 'invalid' as const };

    await enforceOtpRateLimit(client, 'login', user.email_normalized, requestIpHash);
    await client.query(
      `UPDATE public.otp_codes
       SET invalidated_at = NOW()
       WHERE user_id = $1
         AND purpose = 'login'
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [user.id]
    );
    const otp = await client.query<{ id: string }>(
      `INSERT INTO public.otp_codes (
        user_id,
        purpose,
        email_normalized,
        code_hash,
        challenge_token_hash,
        request_ip_hash,
        expires_at
      )
      VALUES ($1, 'login', $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        user.id,
        user.email_normalized,
        hashOtp('login', otpCode),
        pendingTokenHash,
        requestIpHash,
        otpExpiresAt,
      ]
    );
    const otpId = otp.rows[0]?.id;
    if (!otpId) throw new Error('OTP login tidak dapat dibuat.');

    return { kind: 'success' as const, user, otpId };
  });

  if (outcome.kind === 'invalid') {
    throw new AuthError(401, 'Nama atau password tidak valid.');
  }

  try {
    await sendOtpEmail(outcome.user.email, outcome.user.nama, otpCode);
  } catch (error) {
    await getDatabasePool().query(
      `UPDATE public.otp_codes
       SET invalidated_at = NOW()
       WHERE id = $1
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [outcome.otpId]
    );
    if (error instanceof ServerConfigurationError) throw error;
    throw new AuthError(502, 'Kode verifikasi belum dapat dikirim. Silakan coba lagi.');
  }

  return {
    pendingToken,
    pendingExpiresAt: otpExpiresAt,
    otpExpiresAt,
    destination: maskEmail(outcome.user.email),
  };
}

export async function resendLoginOtp(
  pendingToken: string | undefined,
  headers: Headers
): Promise<Pick<StartLoginResult, 'otpExpiresAt' | 'destination'>> {
  if (!pendingToken) {
    throw new AuthError(400, 'Sesi verifikasi login tidak ditemukan. Masuk kembali untuk meminta OTP baru.');
  }

  const otpCode = generateOtp();
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  const requestIpHash = hashIp(getRequestIp(headers));
  const pendingTokenHash = hashOpaqueToken(pendingToken);

  const outcome = await withTransaction(async (client) => {
    const selected = await client.query<LoginOtpRow>(
      `SELECT
        o.id,
        o.code_hash,
        o.expires_at,
        o.attempts,
        o.user_id,
        u.account_id,
        u.nama,
        u.email,
        u.email_normalized,
        u.role,
        u.created_at
       FROM public.otp_codes o
       INNER JOIN public.users u ON u.id = o.user_id
       WHERE o.challenge_token_hash = $1
         AND o.purpose = 'login'
         AND o.consumed_at IS NULL
         AND o.invalidated_at IS NULL
       ORDER BY o.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [pendingTokenHash]
    );
    const current = selected.rows[0];
    if (!current || current.expires_at <= new Date()) {
      return { kind: 'expired' as const };
    }

    await enforceOtpRateLimit(client, 'login', current.email_normalized, requestIpHash);
    await client.query('UPDATE public.otp_codes SET invalidated_at = NOW() WHERE id = $1', [current.id]);
    const replacement = await client.query<{ id: string }>(
      `INSERT INTO public.otp_codes (
        user_id,
        purpose,
        email_normalized,
        code_hash,
        challenge_token_hash,
        request_ip_hash,
        expires_at
      )
      VALUES ($1, 'login', $2, $3, $4, $5, $6)
      RETURNING id`,
      [
        current.user_id,
        current.email_normalized,
        hashOtp('login', otpCode),
        pendingTokenHash,
        requestIpHash,
        otpExpiresAt,
      ]
    );
    const otpId = replacement.rows[0]?.id;
    if (!otpId) throw new Error('OTP login tidak dapat diperbarui.');
    return { kind: 'success' as const, current, otpId };
  });

  if (outcome.kind === 'expired') {
    throw new AuthError(400, 'Kode OTP sudah kedaluwarsa. Masuk kembali untuk meminta kode baru.');
  }

  try {
    await sendOtpEmail(outcome.current.email, outcome.current.nama, otpCode);
  } catch (error) {
    await getDatabasePool().query(
      `UPDATE public.otp_codes
       SET invalidated_at = NOW()
       WHERE id = $1
         AND consumed_at IS NULL
         AND invalidated_at IS NULL`,
      [outcome.otpId]
    );
    if (error instanceof ServerConfigurationError) throw error;
    throw new AuthError(502, 'Kode verifikasi belum dapat dikirim. Silakan coba lagi.');
  }

  return { otpExpiresAt, destination: maskEmail(outcome.current.email) };
}

export async function completeSignup(
  pendingToken: string | undefined,
  code: string,
  headers: Headers
): Promise<CompleteSignupResult> {
  if (!pendingToken) {
    throw new AuthError(400, 'Sesi verifikasi tidak ditemukan. Daftar kembali untuk meminta OTP baru.');
  }

  const sessionToken = randomBytes(32).toString('base64url');
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const requestIp = getRequestIp(headers);
  const device = getDeviceInfo(headers);

  const result = await withTransaction<CompleteSignupTransactionResult>(async (client) => {
    const pendingResult = await client.query<PendingSignupRow>(
      `SELECT id, nama, nama_normalized, email, email_normalized, password_hash, expires_at
       FROM public.pending_signups
       WHERE challenge_token_hash = $1
       FOR UPDATE`,
      [hashOpaqueToken(pendingToken)]
    );
    const pending = pendingResult.rows[0];
    if (!pending || pending.expires_at <= new Date()) {
      throw new AuthError(400, 'Sesi verifikasi sudah kedaluwarsa. Daftar kembali untuk meminta OTP baru.');
    }

    const otpResult = await client.query<OtpRow>(
      `SELECT id, code_hash, expires_at, attempts
       FROM public.otp_codes
       WHERE pending_signup_id = $1
         AND purpose = 'signup'
         AND consumed_at IS NULL
         AND invalidated_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [pending.id]
    );
    const otp = otpResult.rows[0];
    if (!otp || otp.expires_at <= new Date()) {
      if (otp) {
        await client.query('UPDATE public.otp_codes SET invalidated_at = NOW() WHERE id = $1', [otp.id]);
      }
      // Return an outcome instead of throwing so the invalidation is committed.
      return {
        kind: 'otp_error',
        status: 400,
        message: 'Kode OTP sudah kedaluwarsa. Minta kode baru.',
      };
    }
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await client.query('UPDATE public.otp_codes SET invalidated_at = NOW() WHERE id = $1', [otp.id]);
      return {
        kind: 'otp_error',
        status: 429,
        message: 'Batas percobaan OTP sudah tercapai. Minta kode baru.',
      };
    }
    if (!securelyMatches(otp.code_hash, hashOtp('signup', code))) {
      const attempts = await client.query<{ attempts: number }>(
        `UPDATE public.otp_codes
         SET attempts = attempts + 1,
             invalidated_at = CASE WHEN attempts + 1 >= $2 THEN NOW() ELSE NULL END
         WHERE id = $1
         RETURNING attempts`,
        [otp.id, MAX_OTP_ATTEMPTS]
      );
      const currentAttempts = attempts.rows[0]?.attempts ?? otp.attempts + 1;
      if (currentAttempts >= MAX_OTP_ATTEMPTS) {
        return {
          kind: 'otp_error',
          status: 429,
          message: 'Batas percobaan OTP sudah tercapai. Minta kode baru.',
        };
      }
      // The attempt update must commit; throwing here would roll it back.
      return { kind: 'otp_error', status: 400, message: 'Kode OTP tidak valid.' };
    }

    const existingUser = await client.query(
      `SELECT id FROM public.users
       WHERE email_normalized = $1 OR nama_normalized = $2
       LIMIT 1`,
      [pending.email_normalized, pending.nama_normalized]
    );
    if (existingUser.rowCount) {
      throw new AuthError(409, 'Nama atau email sudah digunakan.');
    }

    await client.query('UPDATE public.otp_codes SET consumed_at = NOW() WHERE id = $1', [otp.id]);

    const account = await client.query<{ id: string }>(
      'INSERT INTO public.accounts DEFAULT VALUES RETURNING id'
    );
    const accountId = account.rows[0]?.id;
    if (!accountId) throw new Error('Account tidak dapat dibuat.');

    const createdUser = await client.query<{
      id: string;
      nama: string;
      email: string;
      role: 'owner';
      created_at: Date;
    }>(
      `INSERT INTO public.users (
        account_id,
        nama,
        nama_normalized,
        email,
        email_normalized,
        password_hash,
        role
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'owner')
      RETURNING id, nama, email, role, created_at`,
      [
        accountId,
        pending.nama,
        pending.nama_normalized,
        pending.email,
        pending.email_normalized,
        pending.password_hash,
      ]
    );
    const created = createdUser.rows[0];
    if (!created) throw new Error('User tidak dapat dibuat.');

    await client.query('UPDATE public.accounts SET owner_user_id = $1 WHERE id = $2', [
      created.id,
      accountId,
    ]);

    const session = await client.query<{ id: string }>(
      `INSERT INTO public.sessions (
        account_id,
        user_id,
        token_hash,
        device,
        browser,
        os,
        ip,
        status,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'owner', $8)
      RETURNING id`,
      [
        accountId,
        created.id,
        hashOpaqueToken(sessionToken),
        device.device,
        device.browser,
        device.os,
        requestIp === 'unknown' ? null : requestIp,
        sessionExpiresAt,
      ]
    );
    const sessionId = session.rows[0]?.id;
    if (!sessionId) throw new Error('Session tidak dapat dibuat.');

    // Pending credentials and OTP records are removed only after every permanent
    // row and the persistent owner session have been committed successfully.
    await client.query('DELETE FROM public.pending_signups WHERE id = $1', [pending.id]);

    return {
      kind: 'success',
      user: {
        id: created.id,
        nama: created.nama,
        email: created.email,
        role: created.role,
        isOwner: true,
        createdAt: created.created_at.toISOString(),
        currentDevice: sessionId,
      } satisfies PublicAuthUser,
    };
  });

  if (result.kind === 'otp_error') {
    throw new AuthError(result.status, result.message);
  }

  return { sessionToken, sessionExpiresAt, user: result.user, sessionStatus: 'owner' };
}

export async function completeLogin(
  pendingToken: string | undefined,
  code: string,
  headers: Headers
): Promise<CompleteLoginResult> {
  if (!pendingToken) {
    throw new AuthError(400, 'Sesi verifikasi login tidak ditemukan. Masuk kembali untuk meminta OTP baru.');
  }

  const sessionToken = randomBytes(32).toString('base64url');
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const requestIp = getRequestIp(headers);
  const device = getDeviceInfo(headers);
  const pendingTokenHash = hashOpaqueToken(pendingToken);

  const result = await withTransaction<CompleteLoginTransactionResult>(async (client) => {
    const otpResult = await client.query<LoginOtpRow>(
      `SELECT
        o.id,
        o.code_hash,
        o.expires_at,
        o.attempts,
        o.user_id,
        u.account_id,
        u.nama,
        u.email,
        u.email_normalized,
        u.role,
        u.created_at
       FROM public.otp_codes o
       INNER JOIN public.users u ON u.id = o.user_id
       WHERE o.challenge_token_hash = $1
         AND o.purpose = 'login'
         AND o.consumed_at IS NULL
         AND o.invalidated_at IS NULL
       ORDER BY o.created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [pendingTokenHash]
    );
    const otp = otpResult.rows[0];
    if (!otp || otp.expires_at <= new Date()) {
      if (otp) {
        await client.query('UPDATE public.otp_codes SET invalidated_at = NOW() WHERE id = $1', [otp.id]);
      }
      return {
        kind: 'otp_error',
        status: 400,
        message: 'Kode OTP sudah kedaluwarsa. Minta kode baru.',
      };
    }
    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      await client.query('UPDATE public.otp_codes SET invalidated_at = NOW() WHERE id = $1', [otp.id]);
      return {
        kind: 'otp_error',
        status: 429,
        message: 'Batas percobaan OTP sudah tercapai. Minta kode baru.',
      };
    }
    if (!securelyMatches(otp.code_hash, hashOtp('login', code))) {
      const attempts = await client.query<{ attempts: number }>(
        `UPDATE public.otp_codes
         SET attempts = attempts + 1,
             invalidated_at = CASE WHEN attempts + 1 >= $2 THEN NOW() ELSE NULL END
         WHERE id = $1
         RETURNING attempts`,
        [otp.id, MAX_OTP_ATTEMPTS]
      );
      const currentAttempts = attempts.rows[0]?.attempts ?? otp.attempts + 1;
      if (currentAttempts >= MAX_OTP_ATTEMPTS) {
        return {
          kind: 'otp_error',
          status: 429,
          message: 'Batas percobaan OTP sudah tercapai. Minta kode baru.',
        };
      }
      return { kind: 'otp_error', status: 400, message: 'Kode OTP tidak valid.' };
    }

    // Serialising through the account row prevents two concurrent recovery
    // logins from both deciding to become the account's owner session.
    const account = await client.query<{ owner_user_id: string | null }>(
      `SELECT owner_user_id
       FROM public.accounts
       WHERE id = $1
       FOR UPDATE`,
      [otp.account_id]
    );
    const accountOwnerId = account.rows[0]?.owner_user_id;
    if (!accountOwnerId) throw new Error('Pemilik account tidak ditemukan.');

    const ownerSession = await client.query<{ has_owner_session: boolean }>(
      `SELECT EXISTS(
        SELECT 1
        FROM public.sessions
        WHERE account_id = $1
          AND status = 'owner'
          AND revoked_at IS NULL
          AND expires_at > NOW()
      ) AS has_owner_session`,
      [otp.account_id]
    );
    const hasOwnerSession = ownerSession.rows[0]?.has_owner_session ?? false;
    const sessionStatus: AuthSessionStatus =
      otp.user_id === accountOwnerId && !hasOwnerSession ? 'owner' : 'pending';

    const session = await client.query<{ id: string }>(
      `INSERT INTO public.sessions (
        account_id,
        user_id,
        token_hash,
        device,
        browser,
        os,
        ip,
        status,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        otp.account_id,
        otp.user_id,
        hashOpaqueToken(sessionToken),
        device.device,
        device.browser,
        device.os,
        requestIp === 'unknown' ? null : requestIp,
        sessionStatus,
        sessionExpiresAt,
      ]
    );
    const sessionId = session.rows[0]?.id;
    if (!sessionId) throw new Error('Session login tidak dapat dibuat.');

    if (sessionStatus === 'pending') {
      await client.query(
        `INSERT INTO public.notifications (
          account_id,
          recipient_user_id,
          session_id,
          type,
          title,
          message
        )
        VALUES ($1, $2, $3, 'new_login', $4, $5)`,
        [
          otp.account_id,
          accountOwnerId,
          sessionId,
          'Login baru terdeteksi',
          `${device.browser} / ${device.os}${requestIp === 'unknown' ? '' : ` dari IP ${requestIp}`}`,
        ]
      );
    }

    // A consumed login code is no longer needed. This also prevents its opaque
    // challenge from being useful after the session has been minted.
    await client.query('DELETE FROM public.otp_codes WHERE id = $1', [otp.id]);

    return {
      kind: 'success',
      sessionStatus,
      user: {
        id: otp.user_id,
        nama: otp.nama,
        email: otp.email,
        role: otp.role,
        // A second device may authenticate with the owner's credentials, but
        // it must not receive owner controls until it becomes the designated
        // owner session (for example after the old owner session expires).
        isOwner: sessionStatus === 'owner',
        createdAt: otp.created_at.toISOString(),
        currentDevice: sessionId,
      } satisfies PublicAuthUser,
    };
  });

  if (result.kind === 'otp_error') {
    throw new AuthError(result.status, result.message);
  }

  return {
    sessionToken,
    sessionExpiresAt,
    user: result.user,
    sessionStatus: result.sessionStatus,
  };
}

interface SessionLookupRow {
  user_id: string;
  account_id: string;
  owner_user_id: string;
  nama: string;
  email: string;
  role: 'owner' | 'operator' | 'viewer';
  user_created_at: Date;
  session_id: string;
  status: AuthSessionStatus;
}

interface SessionListRow {
  id: string;
  user_id: string;
  device: string;
  browser: string;
  os: string;
  ip: string | null;
  status: PublicSession['status'];
  created_at: Date;
  last_seen_at: Date;
}

function toPublicSession(row: SessionListRow, currentSessionId: string): PublicSession {
  return {
    id: row.id,
    userId: row.user_id,
    deviceName: row.device,
    browser: row.browser,
    os: row.os,
    location: row.ip ? `IP: ${row.ip}` : 'Lokasi tidak tersedia',
    status: row.status,
    lastActive: row.last_seen_at.toISOString(),
    isCurrentDevice: row.id === currentSessionId,
  };
}

/**
 * Returns a valid session even while a fresh device is pending owner approval.
 * Callers that grant account-data access must use requireActiveAuthSession.
 */
export async function getCurrentAuthSession(
  sessionToken: string | undefined
): Promise<CurrentAuthSession | null> {
  if (!sessionToken) return null;

  const result = await getDatabasePool().query<SessionLookupRow>(
    `SELECT
      u.id AS user_id,
      u.account_id,
      a.owner_user_id,
      u.nama,
      u.email,
      u.role,
      u.created_at AS user_created_at,
      s.id AS session_id,
      s.status
     FROM public.sessions s
     INNER JOIN public.users u ON u.id = s.user_id
     INNER JOIN public.accounts a ON a.id = s.account_id
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND s.revoked_at IS NULL
       AND s.status IN ('owner', 'pending', 'allowed')
     LIMIT 1`,
    [hashOpaqueToken(sessionToken)]
  );
  const row = result.rows[0];
  if (!row) return null;

  await getDatabasePool().query('UPDATE public.sessions SET last_seen_at = NOW() WHERE id = $1', [
    row.session_id,
  ]);

  return {
    accountId: row.account_id,
    sessionId: row.session_id,
    sessionStatus: row.status,
    user: {
      id: row.user_id,
      nama: row.nama,
      email: row.email,
      role: row.role,
      isOwner: row.owner_user_id === row.user_id && row.status === 'owner',
      createdAt: row.user_created_at.toISOString(),
      currentDevice: row.session_id,
    },
  };
}

/** Kept for code that only needs a user with access to protected data. */
export async function getCurrentUser(sessionToken: string | undefined): Promise<PublicAuthUser | null> {
  const current = await getCurrentAuthSession(sessionToken);
  if (!current || current.sessionStatus === 'pending') return null;
  return current.user;
}

export async function requireActiveAuthSession(
  sessionToken: string | undefined
): Promise<CurrentAuthSession> {
  const current = await getCurrentAuthSession(sessionToken);
  if (!current) throw new AuthError(401, 'Sesi tidak valid atau sudah berakhir.');
  if (current.sessionStatus === 'pending') {
    throw new AuthError(403, 'Sesi perangkat ini masih menunggu persetujuan pemilik account.');
  }
  return current;
}

/**
 * SameSite cookies are the primary CSRF mitigation. When browsers send Origin,
 * also reject a cross-site request. APP_ORIGIN is optional for reverse proxies.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin) return;

  let expectedOrigin: string;
  try {
    expectedOrigin = process.env.APP_ORIGIN?.trim()
      ? new URL(process.env.APP_ORIGIN).origin
      : new URL(request.url).origin;
  } catch {
    throw new AuthError(403, 'Origin request tidak valid.');
  }

  if (origin !== expectedOrigin) {
    throw new AuthError(403, 'Permintaan lintas situs ditolak.');
  }
}

async function requireAccountOwner(
  client: PoolClient,
  current: CurrentAuthSession
): Promise<string> {
  const account = await client.query<{ owner_user_id: string | null }>(
    `SELECT owner_user_id
     FROM public.accounts
     WHERE id = $1
     FOR SHARE`,
    [current.accountId]
  );
  const ownerUserId = account.rows[0]?.owner_user_id;
  if (
    !ownerUserId ||
    ownerUserId !== current.user.id ||
    current.sessionStatus !== 'owner'
  ) {
    throw new AuthError(403, 'Hanya pemilik account yang dapat mengelola perangkat.');
  }
  return ownerUserId;
}

export async function listAccountSessions(
  sessionToken: string | undefined
): Promise<PublicSession[]> {
  const current = await requireActiveAuthSession(sessionToken);
  return withTransaction(async (client) => {
    await requireAccountOwner(client, current);
    const result = await client.query<SessionListRow>(
      `SELECT id, user_id, device, browser, os, ip, status, created_at, last_seen_at
       FROM public.sessions
       WHERE account_id = $1
         AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [current.accountId]
    );
    return result.rows.map((row) => toPublicSession(row, current.sessionId));
  });
}

export async function allowAccountSession(
  sessionToken: string | undefined,
  targetSessionId: string
): Promise<PublicSession> {
  const current = await requireActiveAuthSession(sessionToken);
  return withTransaction(async (client) => {
    const ownerUserId = await requireAccountOwner(client, current);
    const targetResult = await client.query<SessionListRow>(
      `SELECT id, user_id, device, browser, os, ip, status, created_at, last_seen_at
       FROM public.sessions
       WHERE id = $1 AND account_id = $2
       FOR UPDATE`,
      [targetSessionId, current.accountId]
    );
    const target = targetResult.rows[0];
    if (!target) throw new AuthError(404, 'Session perangkat tidak ditemukan.');
    if (target.status === 'owner') {
      throw new AuthError(409, 'Session pemilik tidak memerlukan persetujuan.');
    }
    if (target.status === 'revoked' || target.status === 'blocked') {
      throw new AuthError(409, 'Session perangkat sudah tidak aktif.');
    }

    if (target.status === 'pending') {
      const updated = await client.query<SessionListRow>(
        `UPDATE public.sessions
         SET status = 'allowed', last_seen_at = NOW()
         WHERE id = $1
         RETURNING id, user_id, device, browser, os, ip, status, created_at, last_seen_at`,
        [target.id]
      );
      const allowed = updated.rows[0];
      if (!allowed) throw new Error('Session perangkat tidak dapat diperbarui.');

      await client.query(
        `UPDATE public.notifications
         SET read_at = COALESCE(read_at, NOW())
         WHERE account_id = $1
           AND session_id = $2
           AND type = 'new_login'`,
        [current.accountId, target.id]
      );
      await client.query(
        `INSERT INTO public.notifications (
          account_id, recipient_user_id, session_id, type, title, message
        )
        VALUES ($1, $2, $3, 'login_allowed', $4, $5)`,
        [
          current.accountId,
          ownerUserId,
          target.id,
          'Perangkat diizinkan',
          `${target.browser} / ${target.os} telah diizinkan.`,
        ]
      );
      return toPublicSession(allowed, current.sessionId);
    }

    return toPublicSession(target, current.sessionId);
  });
}

export async function revokeAccountSession(
  sessionToken: string | undefined,
  targetSessionId: string
): Promise<PublicSession> {
  const current = await requireActiveAuthSession(sessionToken);
  return withTransaction(async (client) => {
    const ownerUserId = await requireAccountOwner(client, current);
    const targetResult = await client.query<SessionListRow>(
      `SELECT id, user_id, device, browser, os, ip, status, created_at, last_seen_at
       FROM public.sessions
       WHERE id = $1 AND account_id = $2
       FOR UPDATE`,
      [targetSessionId, current.accountId]
    );
    const target = targetResult.rows[0];
    if (!target) throw new AuthError(404, 'Session perangkat tidak ditemukan.');
    if (target.status === 'owner') {
      throw new AuthError(403, 'Session pemilik tidak dapat dikeluarkan melalui kontrol perangkat.');
    }

    if (target.status === 'revoked') return toPublicSession(target, current.sessionId);

    const updated = await client.query<SessionListRow>(
      `UPDATE public.sessions
       SET status = 'revoked', revoked_at = NOW(), last_seen_at = NOW()
       WHERE id = $1
       RETURNING id, user_id, device, browser, os, ip, status, created_at, last_seen_at`,
      [target.id]
    );
    const revoked = updated.rows[0];
    if (!revoked) throw new Error('Session perangkat tidak dapat dikeluarkan.');

    await client.query(
      `UPDATE public.notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE account_id = $1
         AND session_id = $2
         AND type = 'new_login'`,
      [current.accountId, target.id]
    );
    await client.query(
      `INSERT INTO public.notifications (
        account_id, recipient_user_id, session_id, type, title, message
      )
      VALUES ($1, $2, $3, 'device_logout', $4, $5)`,
      [
        current.accountId,
        ownerUserId,
        target.id,
        'Perangkat dikeluarkan',
        `${target.browser} / ${target.os} telah dikeluarkan dari account.`,
      ]
    );
    return toPublicSession(revoked, current.sessionId);
  });
}

interface NotificationRow {
  id: string;
  type: PublicNotification['type'];
  title: string;
  message: string;
  read_at: Date | null;
  created_at: Date;
  session_id: string | null;
  session_status: AuthSessionStatus | 'blocked' | 'revoked' | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  ip: string | null;
}

function toPublicNotification(row: NotificationRow): PublicNotification {
  const deviceInfo = row.browser && row.os ? `${row.browser} / ${row.os}` : undefined;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    timestamp: row.created_at.toISOString(),
    read: row.read_at !== null,
    ...(row.session_id ? { sessionId: row.session_id } : {}),
    ...(row.type === 'new_login' && row.session_status === 'pending'
      ? { actionRequired: true }
      : {}),
    ...(deviceInfo ? { deviceInfo } : {}),
    ...(row.ip ? { location: `IP: ${row.ip}` } : {}),
  };
}

export async function listNotifications(
  sessionToken: string | undefined
): Promise<PublicNotification[]> {
  const current = await requireActiveAuthSession(sessionToken);
  if (!current.user.isOwner || current.sessionStatus !== 'owner') {
    throw new AuthError(403, 'Hanya pemilik account yang dapat melihat notifikasi perangkat.');
  }
  const result = await getDatabasePool().query<NotificationRow>(
    `SELECT
      n.id,
      n.type,
      n.title,
      n.message,
      n.read_at,
      n.created_at,
      n.session_id,
      s.status AS session_status,
      s.device,
      s.browser,
      s.os,
      s.ip
     FROM public.notifications n
     LEFT JOIN public.sessions s ON s.id = n.session_id
     WHERE n.recipient_user_id = $1
     ORDER BY n.created_at DESC
     LIMIT 100`,
    [current.user.id]
  );
  return result.rows.map(toPublicNotification);
}

export async function markNotificationRead(
  sessionToken: string | undefined,
  notificationId: string
): Promise<PublicNotification> {
  const current = await requireActiveAuthSession(sessionToken);
  if (!current.user.isOwner || current.sessionStatus !== 'owner') {
    throw new AuthError(403, 'Hanya pemilik account yang dapat mengelola notifikasi perangkat.');
  }
  const result = await getDatabasePool().query<NotificationRow>(
    `WITH updated AS (
      UPDATE public.notifications
      SET read_at = COALESCE(read_at, NOW())
      WHERE id = $1 AND recipient_user_id = $2
      RETURNING id, type, title, message, read_at, created_at, session_id
    )
    SELECT
      updated.id,
      updated.type,
      updated.title,
      updated.message,
      updated.read_at,
      updated.created_at,
      updated.session_id,
      s.status AS session_status,
      s.device,
      s.browser,
      s.os,
      s.ip
    FROM updated
    LEFT JOIN public.sessions s ON s.id = updated.session_id`,
    [notificationId, current.user.id]
  );
  const notification = result.rows[0];
  if (!notification) throw new AuthError(404, 'Notifikasi tidak ditemukan.');
  return toPublicNotification(notification);
}


export async function revokeCurrentSession(sessionToken: string | undefined): Promise<void> {
  if (!sessionToken) return;
  await getDatabasePool().query(
    `UPDATE public.sessions
     SET status = 'revoked', revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashOpaqueToken(sessionToken)]
  );
}
