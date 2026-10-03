-- Smart River Phase 2: login OTP challenges, per-device session approval,
-- and owner notifications. This extends the Phase 1 custom-auth tables.

BEGIN;

-- A login OTP uses an opaque, HttpOnly browser challenge rather than exposing a
-- user id to the client. Existing signup OTP records keep this column NULL.
ALTER TABLE public.otp_codes
  ADD COLUMN IF NOT EXISTS challenge_token_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS otp_codes_challenge_token_hash_key
  ON public.otp_codes (challenge_token_hash)
  WHERE challenge_token_hash IS NOT NULL
    AND consumed_at IS NULL
    AND invalidated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS otp_codes_one_active_user_target_key
  ON public.otp_codes (user_id, purpose)
  WHERE user_id IS NOT NULL
    AND consumed_at IS NULL
    AND invalidated_at IS NULL;

CREATE INDEX IF NOT EXISTS sessions_account_status_index
  ON public.sessions (account_id, status, expires_at DESC)
  WHERE revoked_at IS NULL;

-- Password attempts are retained only long enough to enforce a small
-- server-side login limit. Values stored here are HMAC hashes, never names or IPs.
CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
  id bigserial PRIMARY KEY,
  identifier_hash text NOT NULL,
  request_ip_hash text,
  succeeded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_login_attempts_identifier_index
  ON public.auth_login_attempts (identifier_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_login_attempts_ip_index
  ON public.auth_login_attempts (request_ip_hash, created_at DESC)
  WHERE request_ip_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('new_login', 'login_allowed', 'device_logout', 'alert', 'system')),
  title text NOT NULL,
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_index
  ON public.notifications (recipient_user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_account_session_index
  ON public.notifications (account_id, session_id, created_at DESC);

ALTER TABLE public.auth_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

COMMIT;
