import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import type { Lead } from '@/types';

const adminDb = getAdminDb();

export interface CsvRow {
  businessName: string;
  Full_Address: string;
  City: string;
  Website?: string;
  Email_From_WEBSITE?: string;
  Phone_1?: string;
  Zip?: string;
  Place_ID: string;
  contactName?: string;
  campaign?: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
}

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
export async function importLeads(rows: CsvRow[]): Promise<ImportResult> {
  const leadsRef = adminDb.collection(COLLECTIONS.LEADS);
  const result: ImportResult = { imported: 0, duplicates: 0, errors: [] };

  const existingSnap = await leadsRef.select('place_id', 'phone').get();
  const existingPlaceIds = new Set<string>();
  const existingPhones = new Set<string>();

  existingSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.place_id) existingPlaceIds.add(String(data.place_id).trim());
    if (data.phone) existingPhones.add(String(data.phone).trim());
  });

  const BATCH_SIZE = 450;
  let batch = adminDb.batch();
  let batchCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      const placeId = String(row.Place_ID || '').trim();
      if (!placeId) {
        result.errors.push(`Row ${i + 1}: Missing Place_ID`);
        continue;
      }

      const normPhone = normalisePhone(row.Phone_1);

      if (existingPlaceIds.has(placeId) || (normPhone && existingPhones.has(normPhone))) {
        result.duplicates++;
        continue;
      }

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
        createdAt: now,
        updatedAt: now,
      };

      // Use Place_ID as the Firestore document ID for easy lookup/testing
      batch.set(leadsRef.doc(placeId), lead, { merge: true });

      existingPlaceIds.add(placeId);
      if (normPhone) existingPhones.add(normPhone);

      batchCount++;
      result.imported++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    } catch (err: unknown) {
      result.errors.push(
        `Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return result;
}
