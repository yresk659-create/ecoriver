import 'server-only';

/** Reads one cookie without depending on a framework-specific Request type. */
export function readRequestCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/** A JSON body is optional for endpoints such as OTP resend. */
export async function readOptionalJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return undefined;
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
