-- Smart River Phase 1: pending registration, OTP verification, and owner session.
-- Apply this only after confirming that the target database does not already
-- provide equivalent custom-auth tables. This migration intentionally does not
-- create Supabase Auth users and does not expose these tables to browser clients.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  nama text NOT NULL,
  nama_normalized text NOT NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'operator', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_nama_normalized_not_empty CHECK (length(nama_normalized) > 0),
  CONSTRAINT users_email_normalized_not_empty CHECK (length(email_normalized) > 0)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'accounts_owner_user_id_fkey'
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT accounts_owner_user_id_fkey
      FOREIGN KEY (owner_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pending_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nama text NOT NULL,
  nama_normalized text NOT NULL,
  email text NOT NULL,
  email_normalized text NOT NULL,
  password_hash text NOT NULL,
  challenge_token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT pending_signups_nama_normalized_not_empty CHECK (length(nama_normalized) > 0),
  CONSTRAINT pending_signups_email_normalized_not_empty CHECK (length(email_normalized) > 0)
);

CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  device text NOT NULL DEFAULT 'Unknown device',
  browser text NOT NULL DEFAULT 'Unknown browser',
  os text NOT NULL DEFAULT 'Unknown OS',
  ip text,
  status text NOT NULL CHECK (status IN ('owner', 'pending', 'allowed', 'blocked', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  pending_signup_id uuid REFERENCES public.pending_signups(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('signup', 'login')),
  email_normalized text NOT NULL,
  code_hash text NOT NULL,
  request_ip_hash text,
  expires_at timestamptz NOT NULL,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  invalidated_at timestamptz,
  CONSTRAINT otp_codes_target_matches_purpose CHECK (
    (purpose = 'signup' AND pending_signup_id IS NOT NULL AND user_id IS NULL)
    OR (purpose = 'login' AND user_id IS NOT NULL AND pending_signup_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_key
  ON public.users (email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS users_nama_normalized_key
  ON public.users (nama_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS users_one_owner_per_account_key
  ON public.users (account_id) WHERE role = 'owner';
CREATE UNIQUE INDEX IF NOT EXISTS pending_signups_email_normalized_key
  ON public.pending_signups (email_normalized);
CREATE UNIQUE INDEX IF NOT EXISTS pending_signups_challenge_token_hash_key
  ON public.pending_signups (challenge_token_hash);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_key
  ON public.sessions (token_hash);
CREATE INDEX IF NOT EXISTS sessions_active_user_index
  ON public.sessions (user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS otp_codes_rate_limit_email_index
  ON public.otp_codes (purpose, email_normalized, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_codes_rate_limit_ip_index
  ON public.otp_codes (purpose, request_ip_hash, created_at DESC)
  WHERE request_ip_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS otp_codes_one_active_target_key
  ON public.otp_codes (pending_signup_id, purpose)
  WHERE consumed_at IS NULL AND invalidated_at IS NULL;

-- Custom auth is handled only by server-side Next.js route handlers. With no
-- browser policies, anon/authenticated Supabase clients cannot read these rows.
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

COMMIT;
