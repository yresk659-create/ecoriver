import { NextResponse } from 'next/server';
import {
  listNotifications,
  SESSION_COOKIE_NAME,
  toPublicAuthError,
} from '@/lib/server/auth';
import { readRequestCookie } from '@/lib/server/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const notifications = await listNotifications(readRequestCookie(request, SESSION_COOKIE_NAME));
    return NextResponse.json({ notifications });
  } catch (error) {
    const publicError = toPublicAuthError(error);
    return NextResponse.json({ error: publicError.message }, { status: publicError.status });
  }
}
