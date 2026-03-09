import { NextRequest, NextResponse } from 'next/server';
import {
  getPlaceDetails,
  getNearbyCompetitors,
  milesToMetres,
  type NearbyPlace,
} from '@/lib/google-places';
import { generateStingMessage } from '@/lib/gemini-concierge';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function getApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  );
}

async function resolvePlaceId(args: {
  placeId: string;
  name?: string;
  address?: string;
  apiKey: string;
}): Promise<string> {
  const { placeId, name, address, apiKey } = args;

  if (!placeId) throw new Error('Missing placeId');
  if (!placeId.startsWith('/g/')) return placeId;

  const query = [name, address].filter(Boolean).join(' ').trim();
  if (!query) {
    throw new Error('Cannot resolve /g/ id without name/address');
  }

  const url =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(query)}` +
    `&inputtype=textquery` +
    `&fields=place_id,name` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data?.status !== 'OK' || !data?.candidates?.length) {
    throw new Error(`findplacefromtext failed: ${data?.status ?? 'UNKNOWN'}`);
  }

  return data.candidates[0].place_id;
}

function pickStingCompetitor(candidates: NearbyPlace[]): NearbyPlace | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return (a.distanceMetres ?? Number.MAX_SAFE_INTEGER) - (b.distanceMetres ?? Number.MAX_SAFE_INTEGER);
  })[0] ?? null;
}

async function handle(reqData: {
  placeId?: string;
  place_id?: string;
  name?: string;
  address?: string;
  category?: string;
  keyword?: string;
  refresh?: boolean;
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Missing Google Maps/Places API key' }, { status: 500 });
  }

  const placeId = (reqData.placeId ?? reqData.place_id ?? '').toString().trim();
  const name = (reqData.name ?? '').toString().trim();
  const address = (reqData.address ?? '').toString().trim();
  const requestedCategory = (reqData.category ?? '').toString().trim().toLowerCase();
  const requestedKeyword = (reqData.keyword ?? '').toString().trim().toLowerCase();
  const refresh = Boolean(reqData.refresh);

  if (!placeId) {
    return NextResponse.json({ ok: false, error: 'Missing place_id' }, { status: 400 });
  }

  let finalPlaceId: string;
  try {
    finalPlaceId = await resolvePlaceId({ placeId, name, address, apiKey });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'Could not resolve place_id', details: e?.message ?? String(e) },
      { status: 400 }
    );
  }

  const adminDb = getAdminDb();
  const categoryKey = requestedCategory || 'default';
  const keywordKey = requestedKeyword || 'none';
  const cacheDocId = `${encodeURIComponent(finalPlaceId)}::${encodeURIComponent(categoryKey)}::${encodeURIComponent(keywordKey)}`;

  if (!refresh && adminDb) {
    try {
      const cacheSnap = await adminDb.collection('competition_cache').doc(cacheDocId).get();
      if (cacheSnap.exists) {
        const cached = cacheSnap.data() as any;
        const createdAtMs = cached?.createdAt ? new Date(cached.createdAt).getTime() : 0;
        const fresh = createdAtMs > 0 && Date.now() - createdAtMs < CACHE_TTL_MS;
        if (fresh && cached?.payload) {
          return NextResponse.json({
            ...cached.payload,
            cached: true,
            cachedAt: cached.createdAt,
          });
        }
      }
    } catch {
      // Cache should not block live data.
    }
  }

  try {
    const business = await getPlaceDetails(finalPlaceId);

    const category = requestedCategory || business.category;

    // Pull a single broad 5-mile pool, then bucket locally by distance.
    // This avoids per-tier API pagination caps causing flat 39/40/40 counts.
    const tier3Pool = await getNearbyCompetitors(
      business.location,
      milesToMetres(5),
      category,
      finalPlaceId,
      requestedKeyword,
      4,
    );

    const tier1Max = milesToMetres(1);
    const tier2Max = milesToMetres(3);
    const tier3Max = milesToMetres(5);

    const tier1 = tier3Pool.filter((p) => (p.distanceMetres ?? Number.MAX_SAFE_INTEGER) <= tier1Max);
    const tier2 = tier3Pool.filter((p) => (p.distanceMetres ?? Number.MAX_SAFE_INTEGER) <= tier2Max);
    const tier3 = tier3Pool.filter((p) => (p.distanceMetres ?? Number.MAX_SAFE_INTEGER) <= tier3Max);

    const stingCompetitor =
      pickStingCompetitor(tier1) ??
      pickStingCompetitor(tier2) ??
      pickStingCompetitor(tier3);

    let stingMessage = '';
    if (stingCompetitor) {
      try {
        stingMessage = await generateStingMessage(
          business.name,
          stingCompetitor.name,
          tier1.length,
        );
      } catch {
        stingMessage = `Customers near you are being recommended to ${stingCompetitor.name}.`;
      }
    }

    const payload = {
      ok: true,
      placeId: finalPlaceId,
      business,
      competitors: {
        tier1,
        tier2,
        tier3,
      },
      counts: {
        tier1: tier1.length,
        tier2: tier2.length,
        tier3: tier3.length,
      },
      stingCompetitor,
      stingMessage,
      cached: false,
    };

    if (adminDb) {
      void adminDb.collection('competition_cache').doc(cacheDocId).set(
        {
          placeId: finalPlaceId,
          category: categoryKey,
          keyword: keywordKey,
          createdAt: new Date().toISOString(),
          payload,
        },
        { merge: true }
      );
    }

    return NextResponse.json(payload);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Failed to load competition data' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return handle({
    place_id: searchParams.get('place_id') ?? undefined,
    placeId: searchParams.get('placeId') ?? undefined,
    name: searchParams.get('name') ?? undefined,
    address: searchParams.get('address') ?? undefined,
    category: searchParams.get('category') ?? undefined,
    keyword: searchParams.get('keyword') ?? undefined,
    refresh: searchParams.get('refresh') === '1',
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(body);
}
