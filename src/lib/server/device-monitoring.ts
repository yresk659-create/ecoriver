import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { AIDetection, EcoRiverDeviceState } from '@/lib/types';
import { getDatabasePool, withTransaction } from './db';
import { requireServerEnv, ServerConfigurationError } from './config';

const booleanInput = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => value === true || value === 1);

const componentDiagnosticSchema = z.object({
  status: z.enum(['ok', 'error', 'unknown']),
  detail: z.string().trim().min(1).max(240).optional(),
  checkedAt: z.string().trim().datetime({ offset: true }).optional(),
});

const componentHealthSchema = z.object({
  camera: componentDiagnosticSchema.optional(),
  esp32: componentDiagnosticSchema.optional(),
  ina219: componentDiagnosticSchema.optional(),
  ajsn: componentDiagnosticSchema.optional(),
  gps: componentDiagnosticSchema.optional(),
  ldr: componentDiagnosticSchema.optional(),
  waterLevel: componentDiagnosticSchema.optional(),
  servo: componentDiagnosticSchema.optional(),
  l298n: componentDiagnosticSchema.optional(),
  uln2003: componentDiagnosticSchema.optional(),
  led: componentDiagnosticSchema.optional(),
  buzzer: componentDiagnosticSchema.optional(),
  distanceSensor: componentDiagnosticSchema.optional(),
  conveyor: componentDiagnosticSchema.optional(),
  power: componentDiagnosticSchema.optional(),
  thruster: componentDiagnosticSchema.optional(),
  raspberryPi: componentDiagnosticSchema.optional(),
});

const deviceTelemetryInputSchema = z.object({
  ldr: z.number().finite().min(0).max(10_000_000),
  water: z.number().finite().min(0).max(10_000_000),
  distance: z.number().finite().min(0).max(100_000),
  pump: booleanInput,
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  speed: z.number().finite().min(0).max(1_000),
  satelit: z.number().int().min(0).max(200),
  voltage: z.number().finite().min(0).max(100),
  current: z.number().finite().min(-10_000_000).max(10_000_000),
  power: z.number().finite().min(-1_000_000).max(1_000_000),
  remote: booleanInput,
  action: z.string().trim().min(1).max(64),
  trash: booleanInput,
  confidence: z.number().finite().min(0).max(100),
  components: componentHealthSchema.optional(),
  observedAt: z.string().trim().optional(),
  sequence: z.number().int().nonnegative().optional(),
});

const storedDeviceStateSchema = z.object({
  schemaVersion: z.literal(1),
  deviceId: z.string().min(1),
  observedAt: z.string().min(1),
  receivedAt: z.string().min(1),
  ldr: z.number(),
  water: z.number(),
  distanceCm: z.number(),
  pumpActive: z.boolean(),
  latitude: z.number(),
  longitude: z.number(),
  speedKmh: z.number(),
  satelliteCount: z.number(),
  voltageV: z.number(),
  currentMa: z.number(),
  powerW: z.number(),
  remoteMode: z.boolean(),
  action: z.string(),
  trashDetected: z.boolean(),
  detectionConfidence: z.number(),
  componentHealth: componentHealthSchema.optional(),
});

export class DeviceIntegrationError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'DeviceIntegrationError';
  }
}

function safeTokenEqual(received: string, expected: string): boolean {
  const receivedHash = createHash('sha256').update(received).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

export function configuredDeviceId(): string {
  return requireServerEnv('SMART_RIVER_SOURCE_ID');
}

export function requireDeviceRequestAuth(request: Request): string {
  const expectedToken = requireServerEnv('SMART_RIVER_MONITORING_TOKEN');
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1] || !safeTokenEqual(match[1], expectedToken)) {
    throw new DeviceIntegrationError(401, 'Autentikasi perangkat tidak valid.');
  }

  const expectedDeviceId = configuredDeviceId();
  const suppliedDeviceId = request.headers.get('x-ecoriver-source')?.trim();
  if (suppliedDeviceId && suppliedDeviceId !== expectedDeviceId) {
    throw new DeviceIntegrationError(403, 'Identitas perangkat tidak diizinkan.');
  }
  return expectedDeviceId;
}

function normalizedObservedAt(value: string | undefined, now: Date): string {
  if (!value) return now.toISOString();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new DeviceIntegrationError(400, 'Waktu pengamatan perangkat tidak valid.');
  }
  if (parsed.getTime() > now.getTime() + 5 * 60_000) {
    throw new DeviceIntegrationError(400, 'Waktu pengamatan perangkat berada terlalu jauh di masa depan.');
  }
  return parsed.toISOString();
}

export function normalizeDeviceTelemetry(
  value: unknown,
  deviceId: string,
  now = new Date()
): { state: EcoRiverDeviceState; sequence?: number } {
  const parsed = deviceTelemetryInputSchema.safeParse(value);
  if (!parsed.success) {
    throw new DeviceIntegrationError(
      400,
      parsed.error.issues[0]?.message
        ? `Data perangkat tidak valid: ${parsed.error.issues[0].message}`
        : 'Data perangkat tidak valid.'
    );
  }

  const confidence = parsed.data.confidence <= 1
    ? parsed.data.confidence * 100
    : parsed.data.confidence;
  const receivedAt = now.toISOString();
  const state: EcoRiverDeviceState = {
    schemaVersion: 1,
    deviceId,
    observedAt: normalizedObservedAt(parsed.data.observedAt, now),
    receivedAt,
    ldr: parsed.data.ldr,
    water: parsed.data.water,
    distanceCm: parsed.data.distance,
    pumpActive: parsed.data.pump,
    latitude: parsed.data.lat,
    longitude: parsed.data.lng,
    speedKmh: parsed.data.speed,
    satelliteCount: parsed.data.satelit,
    voltageV: parsed.data.voltage,
    currentMa: parsed.data.current,
    powerW: parsed.data.power,
    remoteMode: parsed.data.remote,
    action: parsed.data.action.trim().toUpperCase(),
    trashDetected: parsed.data.trash,
    detectionConfidence: Math.round(confidence * 100) / 100,
    ...(parsed.data.components ? { componentHealth: parsed.data.components } : {}),
  };
  return {
    state,
    ...(parsed.data.sequence === undefined ? {} : { sequence: parsed.data.sequence }),
  };
}

export async function storeDeviceTelemetry(
  value: unknown,
  deviceId: string
): Promise<EcoRiverDeviceState> {
  const normalized = normalizeDeviceTelemetry(value, deviceId);
  const payload = JSON.stringify(normalized.state);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO public.ecoriver_telemetry
         (device_id, sequence, observed_at, received_at, payload)
       SELECT $1, $2, $3, $4, $5::jsonb
        WHERE $6::boolean
           OR NOT EXISTS (
             SELECT 1
               FROM public.ecoriver_telemetry
              WHERE device_id = $1
                AND received_at >= $4::timestamptz - INTERVAL '60 seconds'
           )
       ON CONFLICT (device_id, sequence) WHERE sequence IS NOT NULL DO NOTHING`,
      [
        deviceId,
        normalized.sequence ?? null,
        normalized.state.observedAt,
        normalized.state.receivedAt,
        payload,
        normalized.state.trashDetected,
      ]
    );
    await client.query(
      `INSERT INTO public.ecoriver_device_state
         (device_id, observed_at, received_at, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (device_id) DO UPDATE SET
         observed_at = EXCLUDED.observed_at,
         received_at = EXCLUDED.received_at,
         payload = EXCLUDED.payload
       WHERE EXCLUDED.observed_at >= public.ecoriver_device_state.observed_at`,
      [deviceId, normalized.state.observedAt, normalized.state.receivedAt, payload]
    );
    if (normalized.sequence !== undefined && normalized.sequence % 100 === 0) {
      await client.query(
        `DELETE FROM public.ecoriver_telemetry
          WHERE device_id = $1
            AND received_at < NOW() - INTERVAL '30 days'`,
        [deviceId]
      );
    }
  });

  return normalized.state;
}

interface TelemetryRow {
  id: string | number;
  payload: unknown;
}

export interface StoredDeviceMonitoring {
  state: EcoRiverDeviceState;
  detections: AIDetection[];
  hasImage: boolean;
}

export async function readStoredDeviceMonitoring(deviceId: string): Promise<StoredDeviceMonitoring | null> {
  const pool = getDatabasePool();
  const [latestResult, detectionResult, imageResult] = await Promise.all([
    pool.query<{ payload: unknown }>(
      'SELECT payload FROM public.ecoriver_device_state WHERE device_id = $1 LIMIT 1',
      [deviceId]
    ),
    pool.query<TelemetryRow>(
      `SELECT id, payload
         FROM public.ecoriver_telemetry
        WHERE device_id = $1
          AND payload ->> 'trashDetected' = 'true'
        ORDER BY observed_at DESC
        LIMIT 50`,
      [deviceId]
    ),
    pool.query(
      'SELECT 1 FROM public.ecoriver_device_images WHERE device_id = $1 LIMIT 1',
      [deviceId]
    ),
  ]);

  const state = storedDeviceStateSchema.safeParse(latestResult.rows[0]?.payload);
  if (!state.success) return null;
  const hasImage = imageResult.rowCount === 1;
  const location =
    state.data.latitude !== 0 || state.data.longitude !== 0
      ? `${state.data.latitude.toFixed(6)}, ${state.data.longitude.toFixed(6)}`
      : 'EcoRiver';
  const detections = detectionResult.rows.flatMap((row, index) => {
    const detectionState = storedDeviceStateSchema.safeParse(row.payload);
    if (!detectionState.success) return [];
    return [
      {
        id: `${deviceId}-${row.id}`,
        cameraId: `${deviceId}-camera`,
        cameraName: 'Kamera EcoRiver',
        objectType: 'Sampah',
        confidence: detectionState.data.detectionConfidence,
        timestamp: detectionState.data.observedAt,
        location,
        ...(hasImage && index === 0 ? { imageUrl: '/api/device/image' } : {}),
      },
    ];
  });

  return { state: state.data, detections, hasImage };
}

export async function storeDeviceImage(
  deviceId: string,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp',
  bytes: Buffer
): Promise<void> {
  await getDatabasePool().query(
    `INSERT INTO public.ecoriver_device_images (device_id, content_type, image_data, uploaded_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (device_id) DO UPDATE SET
       content_type = EXCLUDED.content_type,
       image_data = EXCLUDED.image_data,
       uploaded_at = EXCLUDED.uploaded_at`,
    [deviceId, contentType, bytes]
  );
}

export async function readDeviceImage(
  deviceId: string
): Promise<{ contentType: string; bytes: Buffer; uploadedAt: Date } | null> {
  const result = await getDatabasePool().query<{
    content_type: string;
    image_data: Buffer;
    uploaded_at: Date;
  }>(
    `SELECT content_type, image_data, uploaded_at
       FROM public.ecoriver_device_images
      WHERE device_id = $1
      LIMIT 1`,
    [deviceId]
  );
  const row = result.rows[0];
  return row
    ? { contentType: row.content_type, bytes: row.image_data, uploadedAt: row.uploaded_at }
    : null;
}

export function deviceImageMaxBytes(): number {
  const configured = Number(process.env.SMART_RIVER_IMAGE_MAX_BYTES);
  return Number.isFinite(configured) && configured >= 100_000 && configured <= 4_000_000
    ? Math.floor(configured)
    : 2_000_000;
}

export function deviceStaleAfterMs(): number {
  const configured = Number(process.env.SMART_RIVER_DEVICE_STALE_SECONDS);
  const seconds = Number.isFinite(configured) && configured >= 10 && configured <= 3_600
    ? configured
    : 30;
  return seconds * 1_000;
}

export function deviceIntegrationPublicError(error: unknown): { status: number; message: string } {
  if (error instanceof DeviceIntegrationError) {
    return { status: error.status, message: error.message };
  }
  if (error instanceof ServerConfigurationError) {
    return { status: 503, message: 'Konfigurasi integrasi perangkat belum lengkap.' };
  }
  return { status: 503, message: 'Data perangkat belum dapat disimpan.' };
}
