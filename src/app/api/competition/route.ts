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
    let businessData: any = null;

    // 1. TRY FIRESTORE (Searching by your specific schema)
    try {
      // Check if Doc ID matches OR if kgmid field matches
      const directDoc = await adminDb.collection(COLLECTIONS.LEADS).doc(placeId).get();
      if (directDoc.exists) {
        businessData = directDoc.data();
      } else {
        const querySnapshot = await adminDb
          .collection(COLLECTIONS.LEADS)
          .where('kgmid', '==', placeId)
          .limit(1)
          .get();
        
        if (!querySnapshot.empty) {
          businessData = querySnapshot.docs[0].data();
        }
      }
    } catch (dbError) {
      console.error('Firestore lookup failed:', dbError);
    }
    
    // 2. FALLBACK TO GOOGLE (Only for standard Place IDs)
    if (!businessData && !placeId.startsWith('/g/')) {
      try {
        businessData = await getPlaceDetails(placeId);
      } catch (googleError: any) {
        console.error(`Google API fail for ${placeId}:`, googleError.message);
      }
    }

    // 3. VALIDATION & MAPPING
    if (!businessData) {
      return NextResponse.json({ 
        error: 'Business not found', 
        message: `ID ${placeId} not found in Database or Google.` 
      }, { status: 404 });
    }

    // Map your DB fields to the format the Unlock page expects
    const sanitizedBusiness = {
      id: placeId,
      name: businessData.businessName || businessData.name || 'Unknown Business',
      phone: businessData.phone || businessData.phoneNumber || '',
      address: businessData.address || '',
      category: businessData.category || 'Restaurant', // Fallback for your sample
      location: businessData.location || null
    };

    // 4. DIALER PROTECTION
    // If we have no location data, we can't find competitors, 
    // but we MUST return the sanitized business so the dialer has the phone number.
    const hasValidLocation = 
      sanitizedBusiness.location && 
      typeof sanitizedBusiness.location.lat === 'number' && 
      typeof sanitizedBusiness.location.lng === 'number';

    if (!hasValidLocation) {
      return NextResponse.json({
        success: true,
        business: sanitizedBusiness,
        competitors: { tier1: [], tier2: [], tier3: [] },
        counts: { tier1: 0, tier2: 0, tier3: 0 },
        stingMessage: "Competitive landscape analysis unavailable for this record."
      });
    }

    // 5. FETCH COMPETITORS (Standard Logic)
    let competitors = { tier1: [] as any[], tier2: [] as any[], tier3: [] as any[] };
    let counts = { tier1: 0, tier2: 0, tier3: 0 };

    try {
      const [t1walk, t2walk, t3walk] = await Promise.all([
        getNearbyCompetitors(sanitizedBusiness.location, walkMinutesToMetres(5),  sanitizedBusiness.category, placeId),
        getNearbyCompetitors(sanitizedBusiness.location, walkMinutesToMetres(10), sanitizedBusiness.category, placeId),
        getNearbyCompetitors(sanitizedBusiness.location, walkMinutesToMetres(20), sanitizedBusiness.category, placeId),
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
      console.error('Competitor search failed:', compError);
    }

    // 6. GENERATE STING
    let stingMessage = '';
    let stingCandidate = null;

    try {
      stingCandidate = [...competitors.tier1]
        .filter(p => p.openNow !== false)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]
        || competitors.tier1[0] || competitors.tier2[0];

      if (stingCandidate) {
        stingMessage = await generateStingMessage(sanitizedBusiness.name, stingCandidate.name, competitors.tier1.length);
      }
    } catch (aiError) {
      console.error('AI Sting generation failed:', aiError);
    }

    return NextResponse.json({
      success: true,
      business: sanitizedBusiness,
      stingCompetitor: stingCandidate ?? null,
      stingMessage,
      competitors,
      counts,
    });

  } catch (err: any) {
    console.error('[/api/competition] UNCAUGHT FAILURE:', err);
    return NextResponse.json({ error: 'Internal Server Error', message: err.message }, { status: 500 });
  }
}
