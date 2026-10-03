import { NextResponse } from 'next/server';
import { toPublicAuthError } from '@/lib/server/auth';
import { requireActiveRequestAuth } from '@/lib/server/api-auth';
import { getDevices } from '@/lib/server/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireActiveRequestAuth(request);
    const result = await getDevices();
    return NextResponse.json({ source: result.source, timestamp: result.timestamp, devices: result.data });
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
