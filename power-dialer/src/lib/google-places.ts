// ─── Google Places API — server-side wrapper ─────────────────────────────────
// Never import this in client components — uses secret API key

const KEY  = process.env.GOOGLE_PLACES_API_KEY!;
const BASE = 'https://maps.googleapis.com/maps/api';

// ── Types ────────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlacePhoto {
  url:       string; // pre-signed Places photo URL
  width:     number;
  height:    number;
  photoRef:  string;
}

export interface PlaceReview {
  authorName:  string;
  rating:      number;
  text:        string;
  relativeTime: string;
}

export interface PlaceDetails {
  placeId:       string;
  name:          string;
  address:       string;
  location:      LatLng;
  category:      string;   // normalised e.g. "pizza"
  googleTypes:   string[];
  rating?:       number;
  totalRatings?: number;
  priceLevel?:   number;   // 0–4
  phone?:        string;
  website?:      string;
  orderUrl?:     string;   // if Google has it
  photos:        PlacePhoto[];
  reviews:       PlaceReview[];
  openNow?:      boolean;
}

export interface NearbyPlace {
  placeId:       string;
  name:          string;
  location:      LatLng;
  category:      string;
  googleTypes:   string[];
  rating?:       number;
  totalRatings?: number;
  priceLevel?:   number;
  distanceMetres?: number;
  openNow?:      boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function photoUrl(ref: string, maxWidth = 800): string {
  return `${BASE}/place/photo?maxwidth=${maxWidth}&photo_reference=${ref}&key=${KEY}`;
}

/** Haversine distance in metres */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const R  = 6_371_000;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const x  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Map Google types array to a clean category slug */
export function normaliseCategoryFromTypes(types: string[]): string {
  const map: Record<string, string> = {
    restaurant:       'restaurant',
    food:             'restaurant',
    meal_takeaway:    'takeaway',
    meal_delivery:    'delivery',
    cafe:             'cafe',
    bar:              'bar',
    bakery:           'bakery',
    night_club:       'nightclub',
    pizza:            'pizza',
    sushi:            'sushi',
    chinese:          'chinese',
    japanese:         'japanese',
    indian:           'indian',
    mexican:          'mexican',
    italian:          'italian',
    thai:             'thai',
    vietnamese:       'vietnamese',
    mediterranean:    'mediterranean',
    american:         'american',
    french:           'french',
    korean:           'korean',
    seafood:          'seafood',
    steak_house:      'steakhouse',
    hamburger:        'burgers',
    ice_cream:        'dessert',
    dessert:          'dessert',
    vegetarian:       'vegetarian',
    vegan:            'vegan',
    breakfast:        'breakfast',
    brunch:           'brunch',
  };
  for (const t of types) {
    const slug = t.toLowerCase().replace(/_restaurant$/, '');
    if (map[slug]) return map[slug];
  }
  return 'restaurant';
}

/** Map our category slug to a Google Places `type` param */
export function categoryToGoogleType(category: string): string {
  const map: Record<string, string> = {
    pizza:       'restaurant',
    sushi:       'restaurant',
    chinese:     'restaurant',
    japanese:    'restaurant',
    indian:      'restaurant',
    mexican:     'restaurant',
    italian:     'restaurant',
    thai:        'restaurant',
    vietnamese:  'restaurant',
    mediterranean: 'restaurant',
    american:    'restaurant',
    french:      'restaurant',
    korean:      'restaurant',
    seafood:     'restaurant',
    steakhouse:  'restaurant',
    burgers:     'restaurant',
    cafe:        'cafe',
    bar:         'bar',
    bakery:      'bakery',
    dessert:     'restaurant',
    restaurant:  'restaurant',
    takeaway:    'meal_takeaway',
    delivery:    'meal_delivery',
  };
  return map[category] ?? 'restaurant';
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** Full place details including photos + reviews */
export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const fields = [
    'place_id', 'name', 'formatted_address', 'geometry',
    'types', 'rating', 'user_ratings_total', 'price_level',
    'formatted_phone_number', 'website', 'opening_hours',
    'photos', 'reviews',
  ].join(',');

  const url = `${BASE}/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${KEY}`;
  const res  = await fetch(url, { next: { revalidate: 3600 } });
  const data = await res.json();

  if (data.status !== 'OK') {
    throw new Error(`Places Details error: ${data.status} — ${data.error_message ?? ''}`);
  }

  const r = data.result;

  // Build photo URLs (max 6)
  const photos: PlacePhoto[] = (r.photos ?? []).slice(0, 6).map((p: { photo_reference: string; width: number; height: number }) => ({
    url:      photoUrl(p.photo_reference),
    width:    p.width,
    height:   p.height,
    photoRef: p.photo_reference,
  }));

  // Pick most positive review (highest rating, non-empty text)
  const reviews: PlaceReview[] = (r.reviews ?? [])
    .filter((rv: { text: string }) => rv.text?.length > 20)
    .sort((a: { rating: number }, b: { rating: number }) => b.rating - a.rating)
    .slice(0, 3)
    .map((rv: { author_name: string; rating: number; text: string; relative_time_description: string }) => ({
      authorName:   rv.author_name,
      rating:       rv.rating,
      text:         rv.text,
      relativeTime: rv.relative_time_description,
    }));

  return {
    placeId:      r.place_id,
    name:         r.name,
    address:      r.formatted_address,
    location:     { lat: r.geometry.location.lat, lng: r.geometry.location.lng },
    category:     normaliseCategoryFromTypes(r.types ?? []),
    googleTypes:  r.types ?? [],
    rating:       r.rating,
    totalRatings: r.user_ratings_total,
    priceLevel:   r.price_level,
    phone:        r.formatted_phone_number,
    website:      r.website,
    photos,
    reviews,
    openNow:      r.opening_hours?.open_now,
  };
}

/** Nearby search — same category, within radius */
export async function getNearbyCompetitors(
  location:       LatLng,
  radiusMetres:   number,
  category:       string,
  excludePlaceId: string,
): Promise<NearbyPlace[]> {
  const type   = categoryToGoogleType(category);
  const params = new URLSearchParams({
    location: `${location.lat},${location.lng}`,
    radius:   String(Math.min(radiusMetres, 50_000)),
    type,
    key: KEY,
  });

  const url  = `${BASE}/place/nearbysearch/json?${params}`;
  const res  = await fetch(url, { next: { revalidate: 1800 } });
  const data = await res.json();

  if (!['OK', 'ZERO_RESULTS'].includes(data.status)) {
    throw new Error(`Places Nearby error: ${data.status}`);
  }

  return (data.results ?? [])
    .filter((p: { place_id: string }) => p.place_id !== excludePlaceId)
    .map((p: {
      place_id: string;
      name: string;
      geometry: { location: { lat: number; lng: number } };
      types: string[];
      rating?: number;
      user_ratings_total?: number;
      price_level?: number;
      opening_hours?: { open_now: boolean };
    }) => ({
      placeId:       p.place_id,
      name:          p.name,
      location:      { lat: p.geometry.location.lat, lng: p.geometry.location.lng },
      category:      normaliseCategoryFromTypes(p.types ?? []),
      googleTypes:   p.types ?? [],
      rating:        p.rating,
      totalRatings:  p.user_ratings_total,
      priceLevel:    p.price_level,
      distanceMetres: haversineMetres(location, {
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
      }),
      openNow: p.opening_hours?.open_now,
    }))
    .sort((a: NearbyPlace, b: NearbyPlace) => (a.distanceMetres ?? 0) - (b.distanceMetres ?? 0));
}

/** Nearby search for consumer concierge — no exclusion, filtered by keyword/type */
export async function getNearbyRestaurants(
  location:     LatLng,
  radiusMetres: number,
  keyword?:     string,
): Promise<NearbyPlace[]> {
  const params = new URLSearchParams({
    location: `${location.lat},${location.lng}`,
    radius:   String(Math.min(radiusMetres, 50_000)),
    type:     'restaurant',
    key:      KEY,
    ...(keyword ? { keyword } : {}),
  });

  const url  = `${BASE}/place/nearbysearch/json?${params}`;
  const res  = await fetch(url, { next: { revalidate: 900 } });
  const data = await res.json();

  if (!['OK', 'ZERO_RESULTS'].includes(data.status)) {
    throw new Error(`Places Nearby error: ${data.status}`);
  }

  return (data.results ?? []).map((p: {
    place_id: string;
    name: string;
    geometry: { location: { lat: number; lng: number } };
    types: string[];
    rating?: number;
    user_ratings_total?: number;
    price_level?: number;
    opening_hours?: { open_now: boolean };
  }) => ({
    placeId:       p.place_id,
    name:          p.name,
    location:      { lat: p.geometry.location.lat, lng: p.geometry.location.lng },
    category:      normaliseCategoryFromTypes(p.types ?? []),
    googleTypes:   p.types ?? [],
    rating:        p.rating,
    totalRatings:  p.user_ratings_total,
    priceLevel:    p.price_level,
    distanceMetres: haversineMetres(location, {
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
    }),
    openNow: p.opening_hours?.open_now,
  }));
}

// ── Radius helpers ────────────────────────────────────────────────────────────

/** Walk speed: ~80 metres per minute */
export function walkMinutesToMetres(minutes: 5 | 10 | 20): number {
  return minutes * 80;
}

/** Drive radius in miles to metres */
export function milesToMetres(miles: 1 | 3 | 5): number {
  return miles * 1609.34;
}

export function priceLevelToString(level?: number): string {
  if (level === undefined) return '';
  return ['', '$', '$$', '$$$', '$$$$'][level] ?? '';
}

export function metrestoReadable(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function metresToMiles(m: number): string {
  return `${(m / 1609.34).toFixed(1)} mi`;
}
