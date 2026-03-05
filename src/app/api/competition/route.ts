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
    let businessData: any = null;
    try {
      const cachedLead = await adminDb.collection(COLLECTIONS.LEADS).doc(placeId).get();
      if (cachedLead.exists) {
        businessData = cachedLead.data();
      }
    } catch (dbError) {
      console.error('Firestore lookup failed, falling back to Google:', dbError);
    }
    
    // 2. Fallback to Google if not in DB
    if (!businessData) {
      try {
        businessData = await getPlaceDetails(placeId);
      } catch (googleError: any) {
        console.error(`Google API fail for ${placeId}:`, googleError.message);
        return NextResponse.json({ error: 'Business not found' }, { status: 404 });
      }
    }

    // 3. Defensive check: Ensure we have the bare minimum to proceed
    if (!businessData) {
      return NextResponse.json({ error: 'Lead data unavailable' }, { status: 404 });
    }

    // If we have no location, we can't find competitors. 
    // Return the business anyway so the dialer has a phone number!
    if (!businessData.location) {
      console.warn(`No location found for ${placeId}. Skipping competitor search.`);
      return NextResponse.json({
        success: true,
        business: { ...businessData, id: placeId },
        competitors: { tier1: [], tier2: [], tier3: [] },
        counts: { tier1: 0, tier2: 0, tier3: 0 },
        stingMessage: "Competitive data unavailable for this location."
      });
    }

    const { location, category } = businessData;

    // 4. Fetch competitors
    let competitors = { tier1: [] as any[], tier2: [] as any[], tier3: [] as any[] };
    let counts = { tier1: 0, tier2: 0, tier3: 0 };

    try {
      const [t1walk, t2walk, t3walk] = await Promise.all([
        getNearbyCompetitors(location, walkMinutesToMetres(5),  category, placeId),
        getNearbyCompetitors(location, walkMinutesToMetres(10), category, placeId),
        getNearbyCompetitors(location, walkMinutesToMetres(20), category, placeId),
      ]);

      const t1Ids = new Set(t1walk.map(p => p.placeId));
      const t2Ids = new Set(t2walk.map(p => p.placeId));

      competitors.tier1 = t1walk;
      competitors.tier2 = t2walk.filter(p => !t1Ids.has(p.placeId));
      competitors.tier3 = t3walk.filter(p => !t2Ids.has(p.placeId));

      counts = {
        tier1: competitors.tier1.length,
        tier2: competitors.tier1.length + competitors.tier2.length,
        tier3: competitors.tier1.length + competitors.tier2.length + competitors.tier3.length,
      };
    } catch (compError) {
      console.error('Competitor search failed, continuing with empty list:', compError);
    }

    // 5. Generate Sting Message (Don't let AI failure kill the response)
    let stingMessage = '';
    let stingCandidate = null;

    try {
      stingCandidate = [...competitors.tier1]
        .filter(p => p.openNow !== false)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]
        || competitors.tier1[0] || competitors.tier2[0];

      if (stingCandidate) {
        stingMessage = await generateStingMessage(businessData.name, stingCandidate.name, competitors.tier1.length);
      }
    } catch (aiError) {
      console.error('AI Sting generation failed:', aiError);
    }

    // Standardize response for the Unlock Page
    return NextResponse.json({
      success: true,
      business: {
        ...businessData,
        id: placeId 
      },
      stingCompetitor: stingCandidate ?? null,
      stingMessage,
      competitors,
      counts,
    });

  } catch (err: any) {
    console.error('[/api/competition] UNCAUGHT CRITICAL FAILURE:', err);
    return NextResponse.json({ 
      error: 'Internal Server Error', 
      message: err.message 
    }, { status: 500 });
  }
}
