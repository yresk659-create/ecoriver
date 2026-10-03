import { NextResponse } from 'next/server';
import { toPublicAuthError } from '@/lib/server/auth';
import { requireActiveRequestAuth } from '@/lib/server/api-auth';
import { getCurrentMonitoring } from '@/lib/server/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireActiveRequestAuth(request);
    const monitoring = await getCurrentMonitoring();
    return NextResponse.json({
      source: monitoring.source,
      timestamp: monitoring.timestamp,
      ...monitoring.data,
    });
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
