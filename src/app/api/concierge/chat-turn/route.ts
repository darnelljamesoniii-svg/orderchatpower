import { NextRequest, NextResponse } from 'next/server';
import { getConciergeTurnText, type ConciergeAnswers, type ChatTurnInput } from '@/lib/gemini-concierge';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { businessName, stage, answers } = (await req.json()) as {
      businessName?: string;
      stage: ChatTurnInput['stage'];
      answers?: Partial<ConciergeAnswers>;
    };

    if (!stage) {
      return NextResponse.json({ error: 'stage is required' }, { status: 400 });
    }

    const text = await getConciergeTurnText({ businessName, stage, answers });
    return NextResponse.json({ text });
  } catch (err: unknown) {
    console.error('[/api/concierge/chat-turn]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate concierge turn' },
      { status: 500 },
    );
  }
}
