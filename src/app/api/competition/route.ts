import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ''
  );
}

/**
 * If placeId is already a ChIJ... Place ID, return it.
 * If it's a /g/... feature id, resolve using name+address (NOT the /g/... string).
 */
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

async function handle(reqData: { placeId?: string; place_id?: string; name?: string; address?: string }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Missing GOOGLE_MAPS_API_KEY' }, { status: 500 });
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

  const detailsUrl =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(finalPlaceId)}` +
    `&fields=place_id,name,types,formatted_address,geometry,website,rating,user_ratings_total` +
    `&key=${encodeURIComponent(apiKey)}`;

  const detailsRes = await fetch(detailsUrl);
  const detailsData = await detailsRes.json();

  if (detailsData?.status !== 'OK') {
    return NextResponse.json(
      { ok: false, error: `Place Details failed: ${detailsData?.status ?? 'UNKNOWN'}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    placeId: finalPlaceId,
    name: detailsData?.result?.name ?? null,
    address: detailsData?.result?.formatted_address ?? null,
    result: detailsData?.result ?? null,
  });
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
