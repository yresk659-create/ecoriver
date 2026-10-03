import { NextResponse } from 'next/server';
import {
  listAccountSessions,
  SESSION_COOKIE_NAME,
  toPublicAuthError,
} from '@/lib/server/auth';
import { readRequestCookie } from '@/lib/server/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const sessions = await listAccountSessions(readRequestCookie(request, SESSION_COOKIE_NAME));
    return NextResponse.json({ sessions });
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
