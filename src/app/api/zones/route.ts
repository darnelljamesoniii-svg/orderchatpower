import { NextRequest, NextResponse } from 'next/server';
import { checkZoneAvailability, lockZone } from '@/lib/zones';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lat      = parseFloat(searchParams.get('lat') ?? '');
    const lng      = parseFloat(searchParams.get('lng') ?? '');
    const tierId   = searchParams.get('tierId')   ?? '';
    const category = searchParams.get('category') ?? '';

    if (!lat || !lng || !tierId || !category) {
      return NextResponse.json({ error: 'lat, lng, tierId, category required' }, { status: 400 });
    }

    const result = await checkZoneAvailability(lat, lng, tierId, category);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[/api/zones GET]', err);
    return NextResponse.json({ error: 'Zone check failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lat, lng, tierId, placeId, businessName, category, annualPrice, squareOrderId } = body;

    if (!lat || !lng || !tierId || !placeId || !businessName || !category || !annualPrice) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Re-check availability before locking (race condition guard)
    const check = await checkZoneAvailability(lat, lng, tierId, category);
    if (!check.available) {
      return NextResponse.json(
        { error: `Zone already locked by ${check.owner?.name}` },
        { status: 409 },
      );
    }

    const result = await lockZone({ lat, lng, tierId, placeId, businessName, category, annualPrice, squareOrderId });
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    console.error('[/api/zones POST]', err);
    return NextResponse.json({ error: 'Zone lock failed' }, { status: 500 });
  }
}
