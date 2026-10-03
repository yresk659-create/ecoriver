import { NextResponse } from 'next/server';
import {
  deviceIntegrationPublicError,
  requireDeviceRequestAuth,
  storeDeviceTelemetry,
} from '@/lib/server/device-monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TELEMETRY_BYTES = 32_768;

export async function POST(request: Request) {
  try {
    const deviceId = requireDeviceRequestAuth(request);
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.startsWith('application/json')) {
      return NextResponse.json({ error: 'Content-Type harus application/json.' }, { status: 415 });
    }

    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_TELEMETRY_BYTES) {
      return NextResponse.json({ error: 'Payload perangkat terlalu besar.' }, { status: 413 });
    }

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, 'utf8') > MAX_TELEMETRY_BYTES) {
      return NextResponse.json({ error: 'Payload perangkat terlalu besar.' }, { status: 413 });
    }
    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = undefined;
    }
    const state = await storeDeviceTelemetry(payload, deviceId);
    return NextResponse.json(
      {
        success: true,
        deviceId: state.deviceId,
        observedAt: state.observedAt,
        receivedAt: state.receivedAt,
      },
      {
        status: 202,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const publicError = deviceIntegrationPublicError(error);
    return NextResponse.json(
      { error: publicError.message },
      { status: publicError.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
