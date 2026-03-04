// ─── Rotating Caller IDs ──────────────────────────────────────────────────────
// Reads from Firestore settings/caller_ids
// Uses a transaction to atomically increment the index (true round-robin)

import { getAdminDb } from '@/lib/firebase-admin';
const adminDb = getAdminDb();
import { FieldValue } from 'firebase-admin/firestore';

const SETTINGS_DOC = 'settings/caller_ids';

export interface CallerIdsSettings {
  numbers:      string[];
  currentIndex: number;
}

/**
 * Get the next caller ID in round-robin order.
 * Atomically increments the index in Firestore.
 * Falls back to SIGNALWIRE_PHONE_NUMBER env var if settings doc missing.
 */
export async function getNextCallerId(): Promise<string> {
  const fallback = process.env.SIGNALWIRE_PHONE_NUMBER!;

  try {
    const ref    = adminDb.doc(SETTINGS_DOC);
    let selected = fallback;

    await adminDb.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        // First time — seed with the env var number
        tx.set(ref, { numbers: [fallback], currentIndex: 0 });
        selected = fallback;
        return;
      }

      const data = snap.data() as CallerIdsSettings;
      if (!data.numbers?.length) { selected = fallback; return; }

      const idx = data.currentIndex % data.numbers.length;
      selected  = data.numbers[idx];

      tx.update(ref, { currentIndex: (idx + 1) % data.numbers.length });
    });

    return selected;
  } catch (err) {
    console.error('[getNextCallerId]', err);
    return fallback;
  }
}

/**
 * Get the next caller ID after a carrier failure (skip one forward).
 */
export async function getFailoverCallerId(failedNumber: string): Promise<string> {
  const fallback = process.env.SIGNALWIRE_PHONE_NUMBER!;
  try {
    const snap = await adminDb.doc(SETTINGS_DOC).get();
    if (!snap.exists) return fallback;
    const data = snap.data() as CallerIdsSettings;
    if (!data.numbers?.length) return fallback;

    const failedIdx = data.numbers.indexOf(failedNumber);
    if (failedIdx === -1) return data.numbers[0];
    return data.numbers[(failedIdx + 1) % data.numbers.length];
  } catch {
    return fallback;
  }
}

/**
 * Save/update the caller ID list (called from supervisor settings UI).
 */
export async function setCallerIds(numbers: string[]): Promise<void> {
  await adminDb.doc(SETTINGS_DOC).set(
    { numbers, currentIndex: 0 },
    { merge: false },
  );
}

/**
 * Get current caller ID list (for supervisor display).
 */
export async function getCallerIds(): Promise<CallerIdsSettings> {
  const snap = await adminDb.doc(SETTINGS_DOC).get();
  if (!snap.exists) return { numbers: [process.env.SIGNALWIRE_PHONE_NUMBER ?? ''], currentIndex: 0 };
  return snap.data() as CallerIdsSettings;
}

