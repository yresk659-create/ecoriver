import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  allowAccountSession,
  assertSameOrigin,
  SESSION_COOKIE_NAME,
  toPublicAuthError,
} from '@/lib/server/auth';
import { readRequestCookie } from '@/lib/server/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sessionIdSchema = z.string().uuid('ID session tidak valid.');

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = sessionIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }

  try {
    assertSameOrigin(request);
    const session = await allowAccountSession(
      readRequestCookie(request, SESSION_COOKIE_NAME),
      parsed.data
    );
    return NextResponse.json({ session });
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
