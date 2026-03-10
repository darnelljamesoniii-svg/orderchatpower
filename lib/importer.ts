import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import type { Lead } from '@/types';

export interface CsvRow {
  businessName: string;
  Full_Address?: string;
  City?: string;
  Website?: string;
  Email_From_WEBSITE?: string;
  Phone_1: string;
  Zip?: string;
  Place_ID: string;
  contactName: string;
  campaign?: 'wave1' | 'wave2';
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
}

/**
 * Normalises a phone number to E.164 format (digits only, with country code).
 */
function normalisePhone(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) throw new Error('Missing phone number');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

/**
 * Since your file does not include timezone/utcOffsetHours,
 * default by ZIP/state/city campaign for now.
 * Your sample is Orlando, FL, so America/New_York / -5 is correct.
 */
function deriveTimezone(row: CsvRow): { timezone: string; utcOffsetHours: number } {
  return {
    timezone: 'America/New_York',
    utcOffsetHours: -5,
  };
}

/**
 * Import CSV rows into Firestore, deduplicating on phone AND kgmid.
 * Maps CSV columns:
 * - Phone_1   -> phone
 * - Place_ID  -> kgmid
 * - Full_Address -> address
 * - Email_From_WEBSITE -> email
 */
export async function importLeads(rows: CsvRow[]): Promise<ImportResult> {
  const leadsRef = adminDb.collection(COLLECTIONS.LEADS);
  const result: ImportResult = { imported: 0, duplicates: 0, errors: [] };

  // Pre-fetch all existing phones and kgmids in one go
  const existingPhonesSnap = await leadsRef.select('phone', 'kgmid').get();
  const existingPhones = new Set<string>();
  const existingKgmids = new Set<string>();

  existingPhonesSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.phone) existingPhones.add(normalisePhone(data.phone));
    if (data.kgmid) existingKgmids.add(String(data.kgmid).trim());
  });

  const BATCH_SIZE = 450;
  let batch = adminDb.batch();
  let batchCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    try {
      if (!row.businessName?.trim()) {
        throw new Error('Missing businessName');
      }

      if (!row.contactName?.trim()) {
        throw new Error('Missing contactName');
      }

      if (!row.Phone_1?.trim()) {
        throw new Error('Missing Phone_1');
      }

      if (!row.Place_ID?.trim()) {
        throw new Error('Missing Place_ID');
      }

      const normPhone = normalisePhone(row.Phone_1);
      const kgmid = row.Place_ID.trim();
      const { timezone, utcOffsetHours } = deriveTimezone(row);

      if (existingPhones.has(normPhone) || existingKgmids.has(kgmid)) {
        result.duplicates++;
        continue;
      }

      const now = new Date().toISOString();
      const docId = leadsRef.doc().id;

      const lead: Omit<Lead, 'id'> = {
        businessName: row.businessName.trim(),
        contactName: row.contactName.trim(),
        phone: normPhone,
        email: row.Email_From_WEBSITE?.trim() || undefined,
        kgmid,
        address: row.Full_Address?.trim() || undefined,
        timezone,
        utcOffsetHours,
        status: 'NEW',
        retryCount: 0,
        campaign: row.campaign ?? 'wave1',
        createdAt: now,
        updatedAt: now,
      };

      batch.set(leadsRef.doc(docId), lead);
      existingPhones.add(normPhone);
      existingKgmids.add(kgmid);
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
