import { NextResponse } from 'next/server';
import {
  getCurrentAuthSession,
  SESSION_COOKIE_NAME,
  toPublicAuthError,
} from '@/lib/server/auth';
import { readRequestCookie } from '@/lib/server/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const current = await getCurrentAuthSession(readRequestCookie(request, SESSION_COOKIE_NAME));
    if (!current) {
      return NextResponse.json({ error: 'Sesi tidak valid.' }, { status: 401 });
    }
    return NextResponse.json({ user: current.user, sessionStatus: current.sessionStatus });
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
