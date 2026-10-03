import { NextResponse } from 'next/server';
import { AuthError, toPublicAuthError } from '@/lib/server/auth';
import { requireActiveRequestAuth } from '@/lib/server/api-auth';
import {
  configuredDeviceId,
  deviceImageMaxBytes,
  deviceIntegrationPublicError,
  readDeviceImage,
  requireDeviceRequestAuth,
  storeDeviceImage,
} from '@/lib/server/device-monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function POST(request: Request) {
  try {
    const deviceId = requireDeviceRequestAuth(request);
    const maxBytes = deviceImageMaxBytes();
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes + 100_000) {
      return NextResponse.json({ error: 'Gambar perangkat terlalu besar.' }, { status: 413 });
    }

    const formData = await request.formData();
    const image = formData.get('image');
    if (!(image instanceof File) || !supportedImageTypes.has(image.type)) {
      return NextResponse.json({ error: 'File gambar tidak valid.' }, { status: 400 });
    }
    if (image.size <= 0 || image.size > maxBytes) {
      return NextResponse.json({ error: 'Ukuran gambar tidak diizinkan.' }, { status: 413 });
    }

    const bytes = Buffer.from(await image.arrayBuffer());
    await storeDeviceImage(
      deviceId,
      image.type as 'image/jpeg' | 'image/png' | 'image/webp',
      bytes
    );
    return NextResponse.json(
      { success: true, deviceId, bytes: image.size },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    const publicError = deviceIntegrationPublicError(error);
    return NextResponse.json(
      { error: publicError.message },
      { status: publicError.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

export async function GET(request: Request) {
  try {
    await requireActiveRequestAuth(request);
    const image = await readDeviceImage(configuredDeviceId());
    if (!image) {
      return NextResponse.json({ error: 'Gambar perangkat belum tersedia.' }, { status: 404 });
    }
    return new Response(new Uint8Array(image.bytes), {
      status: 200,
      headers: {
        'Content-Type': image.contentType,
        'Content-Length': String(image.bytes.length),
        'Cache-Control': 'private, no-store',
        'Last-Modified': image.uploadedAt.toUTCString(),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const publicError = error instanceof AuthError
      ? toPublicAuthError(error)
      : deviceIntegrationPublicError(error);
    return NextResponse.json(
      { error: publicError.message },
      { status: publicError.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
