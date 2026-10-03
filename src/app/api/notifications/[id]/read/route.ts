import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  assertSameOrigin,
  markNotificationRead,
  SESSION_COOKIE_NAME,
  toPublicAuthError,
} from '@/lib/server/auth';
import { readRequestCookie } from '@/lib/server/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notificationIdSchema = z.string().uuid('ID notifikasi tidak valid.');

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = notificationIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    assertSameOrigin(request);
    const notification = await markNotificationRead(
      readRequestCookie(request, SESSION_COOKIE_NAME),
      parsed.data
    );
    return NextResponse.json({ notification });
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
