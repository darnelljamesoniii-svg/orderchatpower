import { NextRequest, NextResponse } from 'next/server';
import {
  getPlaceDetails,
  getNearbyCompetitors,
  milesToMetres,
  type NearbyPlace,
} from '@/lib/google-places';
import { generateStingMessage } from '@/lib/gemini-concierge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Missing Google Maps/Places API key' }, { status: 500 });
  }

  const placeId = (reqData.placeId ?? reqData.place_id ?? '').toString().trim();
  const name = (reqData.name ?? '').toString().trim();
  const address = (reqData.address ?? '').toString().trim();

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

  try {
    const business = await getPlaceDetails(finalPlaceId);

    const [tier1, tier2, tier3] = await Promise.all([
      getNearbyCompetitors(business.location, milesToMetres(1), business.category, finalPlaceId),
      getNearbyCompetitors(business.location, milesToMetres(3), business.category, finalPlaceId),
      getNearbyCompetitors(business.location, milesToMetres(5), business.category, finalPlaceId),
    ]);

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

    return NextResponse.json({
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
    });
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
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return handle(body);
}
