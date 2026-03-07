import { getAdminDb } from '@/lib/firebase-admin';
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
  Place_ID?: string;
  contactName: string;
  campaign?: 'wave1' | 'wave2' | string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  errors: string[];
}

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

export async function importLeads(rows: CsvRow[]): Promise<ImportResult> {
  const adminDb = getAdminDb();
  const leadsRef = adminDb.collection(COLLECTIONS.LEADS);
  const result: ImportResult = { imported: 0, duplicates: 0, errors: [] };

  const existingSnap = await leadsRef.select('phone', 'placeId').get();
  const existingPhones = new Set<string>();
  const existingPlaceIds = new Set<string>();

  existingSnap.docs.forEach((doc) => {
    const data = doc.data() as any;
    if (data.phone) {
      try {
        existingPhones.add(normalisePhone(String(data.phone)));
      } catch {
        // ignore malformed stored phone
      }
    }
    if (data.placeId) {
      existingPlaceIds.add(String(data.placeId).trim());
    }
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

      const normPhone = normalisePhone(row.Phone_1);
      const placeId = row.Place_ID?.trim() || '';

      if (existingPhones.has(normPhone) || (placeId && existingPlaceIds.has(placeId))) {
        result.duplicates++;
        continue;
      }

      const { timezone, utcOffsetHours } = deriveTimezone(row);
      const now = new Date().toISOString();

      const lead: Omit<Lead, 'id'> = {
        businessName: row.businessName.trim(),
        placeId: placeId || undefined,
        contactName: row.contactName.trim(),
        phone: normPhone,
        email: row.Email_From_WEBSITE?.trim() || undefined,
        address: row.Full_Address?.trim() || undefined,
        website: row.Website?.trim() || undefined,
        city: row.City?.trim() || undefined,
        timezone,
        utcOffsetHours,
        status: 'NEW',
        retryCount: 0,
        campaign: row.campaign ?? 'wave1',
        createdAt: now,
        updatedAt: now,
      };

      const docRef = leadsRef.doc();
      batch.set(docRef, lead);

      existingPhones.add(normPhone);
      if (placeId) existingPlaceIds.add(placeId);
      result.imported++;
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = adminDb.batch();
        batchCount = 0;
      }
    } catch (err: unknown) {
      result.errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return result;
}
