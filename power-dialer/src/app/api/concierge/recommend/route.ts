import { NextRequest, NextResponse } from 'next/server';
import { getRecommendation } from '@/lib/gemini-concierge';
import { getPlaceDetails } from '@/lib/google-places';
import type { ConciergeAnswers } from '@/lib/gemini-concierge';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { answers, candidates, excludePlaceId } = await req.json() as {
      answers:        ConciergeAnswers;
      candidates:     Parameters<typeof getRecommendation>[1];
      excludePlaceId?: string;
    };

    if (!answers || !candidates?.length) {
      return NextResponse.json({ error: 'answers and candidates required' }, { status: 400 });
    }

    // Get Gemini recommendation
    const rec = await getRecommendation(answers, candidates, excludePlaceId);
    if (!rec) {
      return NextResponse.json({ error: 'No suitable restaurant found' }, { status: 404 });
    }

    // Fetch full details including photos + reviews
    const details = await getPlaceDetails(rec.place.placeId);

    return NextResponse.json({ recommendation: rec, details });
  } catch (err: unknown) {
    console.error('[/api/concierge/recommend]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
