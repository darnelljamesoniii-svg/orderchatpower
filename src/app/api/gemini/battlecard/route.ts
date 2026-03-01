import { NextRequest, NextResponse } from 'next/server';
import { generateBattleCard } from '@/lib/gemini';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { transcript, businessType } = await req.json();

    if (!transcript) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const card = await generateBattleCard(transcript, businessType ?? 'local business');
    return NextResponse.json(card);
  } catch (err: unknown) {
    console.error('[/api/gemini/battlecard]', err);
    return NextResponse.json({ error: 'AI coach unavailable' }, { status: 500 });
  }
}
