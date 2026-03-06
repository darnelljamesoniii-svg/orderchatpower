import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import type { Lead } from '@/types';

const adminDb = getAdminDb();

export interface CsvRow {
  businessName: string;
<<<<<<< HEAD
  Full_Address: string;
  City: string;
  Website?: string;
  Email_From_WEBSITE?: string;
  Phone_1?: string;
  Zip?: string;
  Place_ID: string;
  contactName?: string;
  campaign?: string;
=======
  Full_Address?: string;
  City?: string;
  Website?: string;
  Email_From_WEBSITE?: string;
  Phone_1: string;
  Zip?: string;
  Place_ID?: string;
  contactName: string;
  campaign?: 'wave1' | 'wave2';
>>>>>>> b51d70c (Fix demo links and SignalWire calling/callback flow)
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
}

<<<<<<< HEAD
/**
 * Normalizes a phone number to E.164 when possible.
 * Returns undefined if blank.
 */
function normalisePhone(phone?: string): string | undefined {
  if (!phone) return undefined;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

/**
 * Imports rows into Firestore using Place_ID as the source of truth.
 * Dedupe priority:
 *   1) Place_ID
 *   2) normalized phone (if present)
 */
=======
function normalisePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');

  if (!digits) {
    throw new Error('Missing phone number');
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

function deriveTimezone(row: CsvRow): { timezone: string; utcOffsetHours: number } {
  const text = `${row.Full_Address || ''} ${row.City || ''} ${row.Zip || ''}`.toLowerCase();

  if (
    text.includes('ca') ||
    text.includes('california') ||
    text.includes('los angeles') ||
    text.includes('san diego') ||
    text.includes('san francisco') ||
    text.includes('seattle') ||
    text.includes('washington')
  ) {
    return { timezone: 'America/Los_Angeles', utcOffsetHours: -8 };
  }

  if (
    text.includes('co') ||
    text.includes('colorado') ||
    text.includes('denver') ||
    text.includes('az') ||
    text.includes('arizona') ||
    text.includes('phoenix')
  ) {
    return { timezone: 'America/Denver', utcOffsetHours: -7 };
  }

  if (
    text.includes('tx') ||
    text.includes('texas') ||
    text.includes('chicago') ||
    text.includes('illinois') ||
    text.includes('tn') ||
    text.includes('tennessee')
  ) {
    return { timezone: 'America/Chicago', utcOffsetHours: -6 };
  }

  return { timezone: 'America/New_York', utcOffsetHours: -5 };
}

>>>>>>> b51d70c (Fix demo links and SignalWire calling/callback flow)
export async function importLeads(rows: CsvRow[]): Promise<ImportResult> {
  const adminDb = getAdminDb();
  const leadsRef = adminDb.collection(COLLECTIONS.LEADS);
  const result: ImportResult = { imported: 0, duplicates: 0, errors: [] };

<<<<<<< HEAD
  const existingSnap = await leadsRef.select('place_id', 'phone').get();
  const existingPlaceIds = new Set<string>();
  const existingPhones = new Set<string>();

  existingSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.place_id) existingPlaceIds.add(String(data.place_id).trim());
    if (data.phone) existingPhones.add(String(data.phone).trim());
=======
  const existingPhonesSnap = await leadsRef.select('phone').get();
  const existingPhones = new Set<string>();

  existingPhonesSnap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.phone) {
      existingPhones.add(normalisePhone(String(data.phone)));
    }
>>>>>>> b51d70c (Fix demo links and SignalWire calling/callback flow)
  });

  const BATCH_SIZE = 450;
  let batch = adminDb.batch();
  let batchCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
<<<<<<< HEAD
      const placeId = String(row.Place_ID || '').trim();
      if (!placeId) {
        result.errors.push(`Row ${i + 1}: Missing Place_ID`);
        continue;
=======
      if (!row.businessName?.trim()) {
        throw new Error('Missing businessName');
      }

      if (!row.contactName?.trim()) {
        throw new Error('Missing contactName');
      }

      if (!row.Phone_1?.trim()) {
        throw new Error('Missing Phone_1');
>>>>>>> b51d70c (Fix demo links and SignalWire calling/callback flow)
      }

      const normPhone = normalisePhone(row.Phone_1);

<<<<<<< HEAD
      if (existingPlaceIds.has(placeId) || (normPhone && existingPhones.has(normPhone))) {
=======
      if (existingPhones.has(normPhone)) {
>>>>>>> b51d70c (Fix demo links and SignalWire calling/callback flow)
        result.duplicates++;
        continue;
      }

<<<<<<< HEAD
      const now = new Date().toISOString();

      const lead: Omit<Lead, 'id'> & {
        place_id: string;
        city?: string;
        zip?: string;
        website?: string;
      } = {
        businessName: String(row.businessName || '').trim(),
        contactName: String(row.contactName || '').trim() || undefined,
        phone: normPhone,
        email: String(row.Email_From_WEBSITE || '').trim() || undefined,
        address: String(row.Full_Address || '').trim() || undefined,
        city: String(row.City || '').trim() || undefined,
        zip: String(row.Zip || '').trim() || undefined,
        website: String(row.Website || '').trim() || undefined,
        place_id: placeId,
        status: 'NEW',
        retryCount: 0,
        campaign: row.campaign ?? 'general',
=======
      const { timezone, utcOffsetHours } = deriveTimezone(row);
      const now = new Date().toISOString();

      const lead: Omit<Lead, 'id'> = {
        businessName: row.businessName.trim(),
        placeId: row.Place_ID?.trim() || undefined,
        contactName: row.contactName.trim(),
        phone: normPhone,
        email: row.Email_From_WEBSITE?.trim() || undefined,
        address: row.Full_Address?.trim() || undefined,
        timezone,
        utcOffsetHours,
        status: 'NEW',
        retryCount: 0,
        campaign: row.campaign ?? 'wave1',
>>>>>>> b51d70c (Fix demo links and SignalWire calling/callback flow)
        createdAt: now,
        updatedAt: now,
      };

<<<<<<< HEAD
      // Use Place_ID as the Firestore document ID for easy lookup/testing
      batch.set(leadsRef.doc(placeId), lead, { merge: true });

      existingPlaceIds.add(placeId);
      if (normPhone) existingPhones.add(normPhone);

      batchCount++;
=======
      const docRef = leadsRef.doc();
      batch.set(docRef, lead);

      existingPhones.add(normPhone);
>>>>>>> b51d70c (Fix demo links and SignalWire calling/callback flow)
      result.imported++;
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    } catch (err: unknown) {
      result.errors.push(
<<<<<<< HEAD
        `Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`
=======
        `Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`
>>>>>>> b51d70c (Fix demo links and SignalWire calling/callback flow)
      );
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return result;
}
