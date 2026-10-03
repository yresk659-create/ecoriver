import 'server-only';

import { requireActiveAuthSession, SESSION_COOKIE_NAME } from './auth';
import { readRequestCookie } from './request';

/** Requires an owner or allowed session for account-protected API routes. */
export function requireActiveRequestAuth(request: Request) {
  return requireActiveAuthSession(readRequestCookie(request, SESSION_COOKIE_NAME));
}
