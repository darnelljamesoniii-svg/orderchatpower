import { NextRequest, NextResponse } from 'next/server';
import { getNearbyRestaurants, walkMinutesToMetres, milesToMetres } from '@/lib/google-places';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { lat, lng, travelMode, travelRange, cuisine } = await req.json();

    if (!lat || !lng) {
      return NextResponse.json({ error: 'lat and lng required' }, { status: 400 });
    }

    // Compute radius from travel mode + range
    let radiusMetres = 1609; // default 1 mile

    if (travelMode === 'walk') {
      const mins = parseInt(travelRange) as 5 | 10 | 20;
      radiusMetres = walkMinutesToMetres([5, 10, 20].includes(mins) ? mins : 10);
    } else if (travelMode === 'drive' || travelMode === 'delivery') {
      const miles = parseInt(travelRange) as 1 | 3 | 5;
      radiusMetres = milesToMetres([1, 3, 5].includes(miles) ? miles : 3);
    }

    const keyword = cuisine && cuisine !== 'Surprise me' ? cuisine : undefined;
    const places  = await getNearbyRestaurants({ lat, lng }, radiusMetres, keyword);

    return NextResponse.json({ places: places.slice(0, 20) });
  } catch (err: unknown) {
    console.error('[/api/concierge/nearby]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
