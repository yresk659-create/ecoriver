import { NextResponse } from 'next/server';
import { assertSameOrigin, toPublicAuthError } from '@/lib/server/auth';
import { requireActiveRequestAuth } from '@/lib/server/api-auth';
import {
  answerAssistantQuestion,
  AssistantServiceError,
  assistantRequestSchema,
} from '@/lib/server/monitoring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body request harus berupa JSON.' }, { status: 400 });
  }

  const parsed = assistantRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Pesan assistant tidak valid.' },
      { status: 400 }
    );
  }

  try {
    assertSameOrigin(request);
    await requireActiveRequestAuth(request);
    return NextResponse.json(await answerAssistantQuestion(parsed.data));
  } catch (error) {
    if (error instanceof AssistantServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.kind === 'configuration' ? 503 : 502 });
    }
    const publicError = toPublicAuthError(error);
    if (publicError.status !== 500) {
      return NextResponse.json({ error: publicError.message }, { status: publicError.status });
    }
    return NextResponse.json(
      { error: 'Assistant monitoring sedang tidak tersedia. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}
