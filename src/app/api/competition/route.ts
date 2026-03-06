import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Helper to resolve Google Feature IDs (/g/...) to standard Place IDs (ChIJ...)
 * Google Details API can fail if you pass it a /g/ ID directly.
 */
async function resolvePlaceId(id: string, apiKey: string): Promise<string> {
  if (!id) throw new Error('Missing id');
  if (!id.startsWith('/g/')) return id;

  const fallbackUrl =
    `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
    `?input=${encodeURIComponent(id)}` +
    `&inputtype=textquery&fields=place_id,name,geometry&key=${apiKey}`;

  const response = await fetch(fallbackUrl);
  if (!response.ok) throw new Error(`Google API responded with status: ${response.status}`);

  const data = await response.json();
  if (data?.candidates?.length) return data.candidates[0].place_id;

  throw new Error(`No Place ID mapping found for Feature ID: ${id}`);
}

async function handleCompetition(payload: { placeId?: string; place_id?: string }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'Server configuration error: Missing GOOGLE_MAPS_API_KEY' },
      { status: 500 }
    );
  }

  const placeId = (payload.placeId ?? payload.place_id ?? '').toString().trim();
  if (!placeId) {
    return NextResponse.json({ ok: false, error: 'Missing placeId' }, { status: 400 });
  }

  // 1) Resolve /g/ ids → ChIJ...
  let finalPlaceId: string;
  try {
    finalPlaceId = await resolvePlaceId(placeId, apiKey);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'Could not resolve location format.', details: e?.message ?? String(e) },
      { status: 400 }
    );
  }

  // 2) Place details
  const detailsUrl =
    `https://maps.googleapis.com/maps/api/place/details/json` +
    `?place_id=${encodeURIComponent(finalPlaceId)}` +
    `&key=${apiKey}`;

  const detailsRes = await fetch(detailsUrl);
  const detailsData = await detailsRes.json();

  if (detailsData?.status !== 'OK') {
    return NextResponse.json(
      { ok: false, error: `Google Details API error: ${detailsData?.status ?? 'UNKNOWN'}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    placeId: finalPlaceId,
    name: detailsData?.result?.name ?? null,
    message: 'Competition location verified successfully',
  });
}

/**
 * GET wrapper so /api/competition?place_id=... works (fixes 405)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const place_id = searchParams.get('place_id') ?? '';
    const placeId = searchParams.get('placeId') ?? '';
    // (name/address are optional; keep them if you later use them)
    return await handleCompetition({ placeId, place_id });
  } catch (err: any) {
    console.error('CRITICAL_API_ERROR (GET /api/competition):', err);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    return await handleCompetition(body);
  } catch (err: any) {
    console.error('CRITICAL_API_ERROR (POST /api/competition):', err);
    return NextResponse.json(
      { ok: false, error: 'Internal Server Error', message: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
