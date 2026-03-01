// ─── Zone Ownership — Firestore-backed exclusivity engine ────────────────────
import { adminDb } from '@/lib/firebase-admin';

// Simple geohash implementation (no external dependency)
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(lat: number, lng: number, precision: number): string {
  let idx = 0, bit = 0, evenBit = true, hash = '';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;

  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; }
      else             { idx = idx * 2;     lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; }
      else             { idx = idx * 2;     latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += BASE32[idx]; idx = 0; bit = 0; }
  }
  return hash;
}

// Precision → approximate radius
// precision 4 ≈ ±20km   → tier3 (5-mile)
// precision 5 ≈ ±2.4km  → tier2 (3-mile)
// precision 6 ≈ ±0.6km  → tier1 (1-mile)
const TIER_PRECISION: Record<string, number> = {
  tier1: 6,
  tier2: 5,
  tier3: 4,
};

export interface ZoneRecord {
  zoneId:       string;
  tierId:       string;
  placeId:      string;
  businessName: string;
  category:     string;
  lat:          number;
  lng:          number;
  annualPrice:  number;
  lockedAt:     string;
  expiresAt:    string; // 12 months from lock
  squareOrderId?: string;
}

export interface ZoneCheckResult {
  available:  boolean;
  owner?:     { name: string; lockedAt: string; expiresAt: string };
}

function zoneDocId(geohash: string, category: string): string {
  return `${geohash}_${category.toLowerCase().replace(/\s+/g, '_')}`;
}

/** Check if a zone is available for a given tier + category */
export async function checkZoneAvailability(
  lat:      number,
  lng:      number,
  tierId:   string,
  category: string,
): Promise<ZoneCheckResult> {
  const precision = TIER_PRECISION[tierId] ?? 5;
  const geohash   = encodeGeohash(lat, lng, precision);
  const docId     = zoneDocId(geohash, category);
  const snap      = await adminDb.collection('zones').doc(docId).get();

  if (!snap.exists) return { available: true };

  const data = snap.data() as ZoneRecord;
  // Check if expired
  if (new Date(data.expiresAt) < new Date()) {
    // Zone expired — delete and mark available
    await adminDb.collection('zones').doc(docId).delete();
    return { available: true };
  }

  return {
    available: false,
    owner: {
      name:      data.businessName,
      lockedAt:  data.lockedAt,
      expiresAt: data.expiresAt,
    },
  };
}

/** Lock a zone after successful payment */
export async function lockZone(params: {
  lat:          number;
  lng:          number;
  tierId:       string;
  placeId:      string;
  businessName: string;
  category:     string;
  annualPrice:  number;
  squareOrderId?: string;
}): Promise<{ zoneId: string; geohash: string }> {
  const precision = TIER_PRECISION[params.tierId] ?? 5;
  const geohash   = encodeGeohash(params.lat, params.lng, precision);
  const docId     = zoneDocId(geohash, params.category);

  const now      = new Date();
  const expires  = new Date(now);
  expires.setFullYear(expires.getFullYear() + 1);

  const record: ZoneRecord = {
    zoneId:       docId,
    tierId:       params.tierId,
    placeId:      params.placeId,
    businessName: params.businessName,
    category:     params.category,
    lat:          params.lat,
    lng:          params.lng,
    annualPrice:  params.annualPrice,
    lockedAt:     now.toISOString(),
    expiresAt:    expires.toISOString(),
    squareOrderId: params.squareOrderId,
  };

  await adminDb.collection('zones').doc(docId).set(record);
  return { zoneId: docId, geohash };
}

/** Get all zones owned by a place_id (across all tiers) */
export async function getZonesByPlaceId(placeId: string): Promise<ZoneRecord[]> {
  const snap = await adminDb.collection('zones')
    .where('placeId', '==', placeId)
    .get();
  return snap.docs.map(d => d.data() as ZoneRecord);
}
