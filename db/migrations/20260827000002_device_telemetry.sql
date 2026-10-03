-- Smart River Phase 3: authenticated device telemetry ingestion.
-- Stores one latest snapshot per device plus bounded-query history and the
-- latest uploaded camera frame. Browser clients never access these tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.smart_river_device_state (
  device_id text PRIMARY KEY,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  CONSTRAINT smart_river_device_state_device_id_not_empty CHECK (length(device_id) > 0),
  CONSTRAINT smart_river_device_state_payload_is_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE TABLE IF NOT EXISTS public.smart_river_telemetry (
  id bigserial PRIMARY KEY,
  device_id text NOT NULL,
  sequence bigint,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL,
  CONSTRAINT smart_river_telemetry_device_id_not_empty CHECK (length(device_id) > 0),
  CONSTRAINT smart_river_telemetry_payload_is_object CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS smart_river_telemetry_device_time_index
  ON public.smart_river_telemetry (device_id, observed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS smart_river_telemetry_device_sequence_key
  ON public.smart_river_telemetry (device_id, sequence)
  WHERE sequence IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.smart_river_device_images (
  device_id text PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  image_data bytea NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT smart_river_device_images_device_id_not_empty CHECK (length(device_id) > 0),
  CONSTRAINT smart_river_device_images_not_empty CHECK (octet_length(image_data) > 0)
);

ALTER TABLE public.smart_river_device_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_river_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smart_river_device_images ENABLE ROW LEVEL SECURITY;

COMMIT;
