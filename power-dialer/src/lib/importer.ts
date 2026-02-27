import 'server-only';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import type { Lead } from '@/types';

export interface CsvRow {
  businessName: string;
  contactName:  string;
  phone:        string;
  email?:       string;
  address?:     string;
  kgmid:        string;
  timezone:     string;
  utcOffsetHours: number;
  campaign:     'wave1' | 'wave2';
  address?:     string;
}

export interface ImportResult {
  imported:   number;
  duplicates: number;
  errors:     string[];
}

/**
 * Normalises a phone number to E.164 format (digits only, with country code).
 */
function normalisePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

/**
 * Import CSV rows into Firestore, deduplicating on phone AND kgmid.
 * Uses batched writes (max 500/batch).
 */
export async function importLeads(rows: CsvRow[]): Promise<ImportResult> {
  const leadsRef = adminDb.collection(COLLECTIONS.LEADS);
  const result: ImportResult = { imported: 0, duplicates: 0, errors: [] };

  // Pre-fetch all existing phones and kgmids in one go
  const existingPhonesSnap = await leadsRef.select('phone', 'kgmid').get();
  const existingPhones  = new Set<string>();
  const existingKgmids  = new Set<string>();

  existingPhonesSnap.docs.forEach(d => {
    const data = d.data();
    if (data.phone)  existingPhones.add(normalisePhone(data.phone));
    if (data.kgmid)  existingKgmids.add(data.kgmid);
  });

  const BATCH_SIZE = 450;
  let batch        = adminDb.batch();
  let batchCount   = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const normPhone = normalisePhone(row.phone);

      if (existingPhones.has(normPhone) || existingKgmids.has(row.kgmid)) {
        result.duplicates++;
        continue;
      }

      const now   = new Date().toISOString();
      const docId = leadsRef.doc().id;
      const lead: Omit<Lead, 'id'> = {
        businessName:   row.businessName,
        contactName:    row.contactName,
        phone:          normPhone,
        email:          row.email,
        kgmid:          row.kgmid,
        address:        row.address,
        timezone:       row.timezone,
        utcOffsetHours: Number(row.utcOffsetHours),
        status:         'NEW',
        retryCount:     0,
        campaign:       row.campaign ?? 'wave1',
        createdAt:      now,
        updatedAt:      now,
      };

      batch.set(leadsRef.doc(docId), lead);
      existingPhones.add(normPhone);
      existingKgmids.add(row.kgmid);
      batchCount++;
      result.imported++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch      = adminDb.batch();
        batchCount = 0;
      }
    } catch (err: unknown) {
      result.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (batchCount > 0) await batch.commit();

  return result;
}
