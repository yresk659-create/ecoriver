import 'server-only';

export class ServerConfigurationError extends Error {
  constructor(message = 'Konfigurasi server belum lengkap.') {
    super(message);
    this.name = 'ServerConfigurationError';
  }
}

export function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  // Treat the values shown in our setup documentation as missing. This keeps
  // a copied `.env.example` (or bridge example) from failing later with a
  // misleading database, SMTP, or device-authentication error.
  if (
    !value ||
    /^(your-|replace-|dummy|example|placeholder)/i.test(value) ||
    /^(token[_-]?acak|ganti[-_]dengan|alamat[-_]gateway[-_]anda)/i.test(value)
  ) {
    throw new ServerConfigurationError();
  }
  return value;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
