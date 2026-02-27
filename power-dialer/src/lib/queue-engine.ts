import 'server-only';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { FieldValue } from 'firebase-admin/firestore';
import type { Lead, CampaignWave, NextLeadResponse } from '@/types';

const LOCK_DURATION_MS = 60_000; // 60 seconds
const MAX_RETRIES       = 6;

/**
 * Returns the lead's current local hour (0–23) based on its UTC offset.
 */
function getLeadLocalHour(utcOffsetHours: number): number {
  const utcHour = new Date().getUTCHours();
  const local   = (utcHour + utcOffsetHours + 24) % 24;
  return local;
}

/**
 * Is the lead's current local time within the campaign calling window?
 */
function isInCallingWindow(lead: Lead, wave: CampaignWave): boolean {
  const localHour = getLeadLocalHour(lead.utcOffsetHours);
  return localHour >= wave.startHourLocal && localHour < wave.endHourLocal;
}

/**
 * Fetches the next available lead using a Firestore transaction (atomic lock).
 *
 * Priority order:
 *  1. Manual callbacks (status = CALLBACK_MANUAL, nextAvailableAt <= now)
 *  2. Automatic recalls  (status = CALLBACK_AUTO,   nextAvailableAt <= now)
 *  3. Fresh leads        (status = NEW, in active campaign window)
 */
export async function getNextLead(agentId: string): Promise<NextLeadResponse> {
  const leadsRef = adminDb.collection(COLLECTIONS.LEADS);
  const now      = new Date();
  const nowIso   = now.toISOString();

  // Load active campaigns so we can check calling windows
  const campaignSnap = await adminDb.collection(COLLECTIONS.CAMPAIGNS).where('isActive', '==', true).get();
  const activeCampaigns = campaignSnap.docs.map(d => d.data() as CampaignWave);

  if (activeCampaigns.length === 0) {
    return { lead: null, queueDepth: 0, message: 'No active campaign waves.' };
  }

  // ── 1. Manual callbacks ───────────────────────────────────────────────────
  let candidateQuery = leadsRef
    .where('status', '==', 'CALLBACK_MANUAL')
    .where('nextAvailableAt', '<=', nowIso)
    .orderBy('nextAvailableAt', 'asc')
    .limit(10);

  let candidateSnap = await candidateQuery.get();

  // ── 2. Auto recalls ───────────────────────────────────────────────────────
  if (candidateSnap.empty) {
    candidateQuery = leadsRef
      .where('status', '==', 'CALLBACK_AUTO')
      .where('nextAvailableAt', '<=', nowIso)
      .orderBy('nextAvailableAt', 'asc')
      .limit(10);
    candidateSnap = await candidateQuery.get();
  }

  // ── 3. Fresh NEW leads (chase-the-sun: filter by active campaign window) ──
  if (candidateSnap.empty) {
    const activeCampaignIds = activeCampaigns.map(c => c.id);
    candidateQuery = leadsRef
      .where('status', '==', 'NEW')
      .where('campaign', 'in', activeCampaignIds)
      .orderBy('createdAt', 'asc')
      .limit(50); // fetch 50 and filter locally for timezone window
    candidateSnap = await candidateQuery.get();
  }

  if (candidateSnap.empty) {
    // Count remaining for stats
    const remaining = await leadsRef.where('status', 'in', ['NEW', 'CALLBACK_MANUAL', 'CALLBACK_AUTO']).count().get();
    return { lead: null, queueDepth: remaining.data().count, message: 'Queue empty or all leads outside calling window.' };
  }

  // For fresh leads, filter by calling window
  let candidates = candidateSnap.docs.map(d => ({ id: d.id, ...d.data() } as Lead));

  if (candidates[0]?.status === 'NEW') {
    const waveMap = Object.fromEntries(activeCampaigns.map(c => [c.id, c]));
    candidates = candidates.filter(lead => {
      const wave = waveMap[lead.campaign];
      return wave ? isInCallingWindow(lead, wave) : false;
    });
    if (candidates.length === 0) {
      const remaining = await leadsRef.where('status', 'in', ['NEW', 'CALLBACK_MANUAL', 'CALLBACK_AUTO']).count().get();
      return { lead: null, queueDepth: remaining.data().count, message: 'All fresh leads are outside their local calling window right now.' };
    }
  }

  // ── Transactional lock ────────────────────────────────────────────────────
  let lockedLead: Lead | null = null;

  for (const candidate of candidates) {
    try {
      const docRef = leadsRef.doc(candidate.id);
      lockedLead = await adminDb.runTransaction(async (tx) => {
        const snap = await tx.get(docRef);
        if (!snap.exists) return null;
        const data = snap.data() as Lead;

        // Ensure not already locked by another agent
        if (data.assignedAgentId && data.lockedUntil && new Date(data.lockedUntil) > now) {
          return null;
        }

        // Check retry count
        if (data.retryCount > MAX_RETRIES) {
          tx.update(docRef, { status: 'EXHAUSTED', updatedAt: nowIso });
          return null;
        }

        const lockExpiry = new Date(now.getTime() + LOCK_DURATION_MS).toISOString();
        tx.update(docRef, {
          status:          'IN_PROGRESS',
          assignedAgentId: agentId,
          lockedUntil:     lockExpiry,
          lastCalledAt:    nowIso,
          updatedAt:       nowIso,
        });

        return { ...data, id: snap.id, status: 'IN_PROGRESS', assignedAgentId: agentId, lockedUntil: lockExpiry };
      });

      if (lockedLead) break; // Got one — stop iterating
    } catch {
      // Transaction conflict — try next candidate
      continue;
    }
  }

  const remaining = await leadsRef.where('status', 'in', ['NEW', 'CALLBACK_MANUAL', 'CALLBACK_AUTO']).count().get();

  return {
    lead:       lockedLead,
    queueDepth: remaining.data().count,
    message:    lockedLead ? undefined : 'Could not lock any candidate (concurrency conflict). Retry.',
  };
}

/**
 * Apply a disposition outcome to a lead. Called after agent submits disposition.
 */
export async function applyDisposition(
  leadId:     string,
  agentId:    string,
  action:     string,
  recallAt?:  string,
  notes?:     string,
): Promise<void> {
  const leadsRef = adminDb.collection(COLLECTIONS.LEADS);
  const docRef   = leadsRef.doc(leadId);
  const now      = new Date();
  const nowIso   = now.toISOString();

  const updates: Record<string, unknown> = {
    assignedAgentId: null,
    lockedUntil:     null,
    updatedAt:       nowIso,
    notes:           notes ?? FieldValue.delete(),
  };

  switch (action) {
    case 'SUCCESS':
      updates.status   = 'CLOSED';
      updates.closedAt = nowIso;
      break;

    case 'DNC':
    case 'WRONG_NUMBER':
      updates.status = 'BLACKLISTED';
      break;

    case 'RECALL':
      updates.status          = 'CALLBACK_MANUAL';
      updates.nextAvailableAt = recallAt ?? nowIso;
      updates.retryCount      = FieldValue.increment(1);
      break;

    case 'NO_ANSWER':
      updates.status          = 'CALLBACK_AUTO';
      updates.nextAvailableAt = new Date(now.getTime() + 2  * 60 * 60 * 1000).toISOString(); // +2 h
      updates.retryCount      = FieldValue.increment(1);
      break;

    case 'BUSY':
      updates.status          = 'CALLBACK_AUTO';
      updates.nextAvailableAt = new Date(now.getTime() + 5  * 60        * 1000).toISOString(); // +5 min
      updates.retryCount      = FieldValue.increment(1);
      break;

    case 'VOICEMAIL':
      updates.status          = 'CALLBACK_AUTO';
      updates.nextAvailableAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(); // +24 h
      updates.retryCount      = FieldValue.increment(1);
      break;

    default:
      updates.status     = 'CALLBACK_AUTO';
      updates.retryCount = FieldValue.increment(1);
  }

  // Auto-exhaust on retry overflow
  const snap = await docRef.get();
  if (snap.exists) {
    const data   = snap.data() as Lead;
    const retries = (data.retryCount ?? 0) + 1;
    if (retries > MAX_RETRIES && !['CLOSED', 'BLACKLISTED'].includes(updates.status as string)) {
      updates.status = 'EXHAUSTED';
    }
  }

  await docRef.update(updates);
}
