import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import {
  getPlaceDetails, 
  getNearbyCompetitors,
  walkMinutesToMetres,
} from '@/lib/google-places';
import { generateStingMessage } from '@/lib/gemini-concierge';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const placeId = searchParams.get('place_id');

    if (!placeId) {
      return NextResponse.json({ error: 'place_id required' }, { status: 400 });
    }

    const adminDb = getAdminDb();

    // 1. Try Firestore First (Handles CIDs and saves API costs)
    const cachedLead = await adminDb.collection(COLLECTIONS.LEADS).doc(placeId).get();
    
    let businessData;
    if (cachedLead.exists) {
      businessData = cachedLead.data();
    } else {
      // 2. Fallback to Google if not in DB
      try {
        businessData = await getPlaceDetails(placeId);
      } catch (e) {
        console.error(`Google API fail for ${placeId}:`, e);
        return NextResponse.json({ error: 'Business not found in Google or Database' }, { status: 404 });
      }
    }

    // Defensive check to prevent 500 crash
    if (!businessData || !businessData.location) {
      return NextResponse.json({ error: 'Incomplete business data' }, { status: 404 });
    }

    const { location, category } = businessData;

    // 3. Fetch competitors
    const [t1walk, t2walk, t3walk] = await Promise.all([
      getNearbyCompetitors(location, walkMinutesToMetres(5),  category, placeId),
      getNearbyCompetitors(location, walkMinutesToMetres(10), category, placeId),
      getNearbyCompetitors(location, walkMinutesToMetres(20), category, placeId),
    ]);

    const t1Ids = new Set(t1walk.map(p => p.placeId));
    const t2Ids = new Set(t2walk.map(p => p.placeId));

    const tier1 = t1walk;
    const tier2 = t2walk.filter(p => !t1Ids.has(p.placeId));
    const tier3 = t3walk.filter(p => !t2Ids.has(p.placeId));

    const stingCandidate = [...tier1]
      .filter(p => p.openNow !== false)
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]
      || tier1[0] || tier2[0];

    const stingMessage = stingCandidate
      ? await generateStingMessage(businessData.name, stingCandidate.name, tier1.length)
      : '';

    // Standardize response for the Unlock Page
    return NextResponse.json({
      success: true,
      business: {
        ...businessData,
        id: placeId // Ensure ID is attached for the dialer
      },
      stingCompetitor: stingCandidate ?? null,
      stingMessage,
      competitors: { tier1, tier2, tier3 },
      counts: {
        tier1: tier1.length,
        tier2: tier1.length + tier2.length,
        tier3: tier1.length + tier2.length + tier3.length,
      },
    });

  } catch (err: any) {
    console.error('[/api/competition] Critical Failure:', err);
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      message: err.message 
    }, { status: 500 });
  }
}
