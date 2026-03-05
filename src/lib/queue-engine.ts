import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { FieldValue } from 'firebase-admin/firestore';
import { v4 as uuidv4 } from 'uuid';
import type { Lead, CampaignWave, NextLeadResponse } from '@/types';

const LOCK_DURATION_MS     = 60_000;
const MAX_RETRIES          = 6;
const CALLBACK_FALLBACK_MS = 15 * 60 * 1000; // 15 min before releasing orphaned callbacks

function getLeadLocalHour(utcOffsetHours: number): number {
  return (new Date().getUTCHours() + utcOffsetHours + 24) % 24;
}

function isInCallingWindow(lead: Lead, wave: CampaignWave): boolean {
  const h = getLeadLocalHour(lead.utcOffsetHours);
  return h >= wave.startHourLocal && h < wave.endHourLocal;
}

async function isAgentOnline(adminDb: FirebaseFirestore.Firestore, agentId: string): Promise<boolean> {
  const snap = await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).get();
  if (!snap.exists) return false;
  const data  = snap.data()!;
  const last  = data.lastActiveAt ? new Date(data.lastActiveAt).getTime() : 0;
  const stale = Date.now() - last > 5 * 60 * 1000; // 5 min without heartbeat = offline
  return data.status !== 'OFFLINE' && !stale;
}

export async function getNextLead(agentId: string): Promise<NextLeadResponse> {
  const adminDb = getAdminDb();
  if (!adminDb) {
    return { lead: null, queueDepth: 0, message: 'Firebase Admin not initialized.' };
  }

  const leadsRef = adminDb.collection(COLLECTIONS.LEADS);
  const now      = new Date();
  const nowIso   = now.toISOString();

  const campaignSnap = await adminDb
    .collection(COLLECTIONS.CAMPAIGNS)
    .where('isActive', '==', true)
    .get();

  // IMPORTANT: include the doc id (d.data() does not contain it)
  const activeCampaigns = campaignSnap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<CampaignWave, 'id'>),
  })) as CampaignWave[];

  // If you truly want to block dialing when there are no campaigns, keep this.
  // If you want the dialer to still run, remove this early return.
  if (!activeCampaigns.length) {
    const remaining = await leadsRef.where('status', 'in', ['NEW', 'CALLBACK_MANUAL', 'CALLBACK_AUTO']).count().get();
    return { lead: null, queueDepth: remaining.data().count, message: 'No active campaigns.' };
  }

  // ── Priority 1: Agent-owned callbacks that are due ────────────────────────
  const ownedSnap = await leadsRef
    .where('status', '==', 'CALLBACK_MANUAL')
    .where('ownerAgentId', '==', agentId)
    .where('callbackDueAt', '<=', nowIso)
    .orderBy('callbackDueAt', 'asc')
    .limit(5)
    .get();

  // ── Priority 2: Orphaned callbacks (owner offline > 15 min) ──────────────
  const orphanCutoff = new Date(now.getTime() - CALLBACK_FALLBACK_MS).toISOString();
  const orphanSnap   = await leadsRef
    .where('status', '==', 'CALLBACK_MANUAL')
    .where('callbackDueAt', '<=', orphanCutoff)
    .orderBy('callbackDueAt', 'asc')
    .limit(10)
    .get();

  // Filter orphans to only those whose owner is actually offline
  const orphans = (await Promise.all(
    orphanSnap.docs
      .filter(d => d.data().ownerAgentId && d.data().ownerAgentId !== agentId)
      .map(async d => {
        const online = await isAgentOnline(adminDb, d.data().ownerAgentId);
        return online ? null : d;
      })
  )).filter(Boolean) as FirebaseFirestore.QueryDocumentSnapshot[];

  // ── Priority 3: Auto callbacks ────────────────────────────────────────────
  const autoSnap = await leadsRef
    .where('status', '==', 'CALLBACK_AUTO')
    .where('nextAvailableAt', '<=', nowIso)
    .orderBy('nextAvailableAt', 'asc')
    .limit(10)
    .get();

  // ── Priority 4: Fresh NEW leads ───────────────────────────────────────────
  const activeCampaignIds = activeCampaigns.map(c => c.id).filter(Boolean);

  // CRITICAL FIX: "IN requires a non-empty ArrayValue"
  let newSnap: FirebaseFirestore.QuerySnapshot;
  if (activeCampaignIds.length > 0) {
    newSnap = await leadsRef
      .where('status', '==', 'NEW')
      .where('campaign', 'in', activeCampaignIds)
      .orderBy('createdAt', 'asc')
      .limit(50)
      .get();
  } else {
    // Fallback: still allow dialing NEW leads if campaigns exist but ids somehow missing
    newSnap = await leadsRef
      .where('status', '==', 'NEW')
      .orderBy('createdAt', 'asc')
      .limit(50)
      .get();
  }

  const waveMap  = Object.fromEntries(activeCampaigns.map(c => [c.id, c]));
  const newLeads = newSnap.docs
    .map(d => ({ id: d.id, ...d.data() } as Lead))
    .filter(l => waveMap[l.campaign] && isInCallingWindow(l, waveMap[l.campaign]));

  // Build candidate list in priority order
  const candidates = [
    ...ownedSnap.docs,
    ...orphans,
    ...autoSnap.docs,
    ...newLeads.map(l => ({ id: l.id, data: () => l, exists: true } as unknown as FirebaseFirestore.DocumentSnapshot)),
  ] as FirebaseFirestore.DocumentSnapshot[];

  if (!candidates.length) {
    const remaining = await leadsRef.where('status', 'in', ['NEW', 'CALLBACK_MANUAL', 'CALLBACK_AUTO']).count().get();
    return { lead: null, queueDepth: remaining.data().count, message: 'Queue empty or outside calling window.' };
  }

  // ── Transactional lock ────────────────────────────────────────────────────
  let lockedLead: Lead | null = null;

  for (const candidate of candidates) {
    try {
      const docRef = leadsRef.doc(candidate.id);
      lockedLead   = await adminDb.runTransaction(async tx => {
        const snap = await tx.get(docRef);
        if (!snap.exists) return null;
        const data = snap.data() as Lead;

        if (data.assignedAgentId && data.lockedUntil && new Date(data.lockedUntil) > now) return null;
        if ((data.retryCount ?? 0) > MAX_RETRIES) {
          tx.update(docRef, { status: 'EXHAUSTED', updatedAt: nowIso });
          return null;
        }

        const lockExpiry = new Date(now.getTime() + LOCK_DURATION_MS).toISOString();
        const sessionId  = data.sessionId ?? uuidv4(); // generate if not already set

        tx.update(docRef, {
          status:          'IN_PROGRESS',
          assignedAgentId: agentId,
          lockedUntil:     lockExpiry,
          lastCalledAt:    nowIso,
          sessionId,
          updatedAt:       nowIso,
        });

        return {
          ...data,
          id: snap.id,
          status: 'IN_PROGRESS',
          assignedAgentId: agentId,
          lockedUntil: lockExpiry,
          sessionId,
        };
      });

      if (lockedLead) break;
    } catch {
      continue;
    }
  }

  const remaining = await leadsRef.where('status', 'in', ['NEW', 'CALLBACK_MANUAL', 'CALLBACK_AUTO']).count().get();
  return { lead: lockedLead, queueDepth: remaining.data().count };
}

export async function applyDisposition(
  leadId:          string,
  agentId:         string,
  action:          string,
  recallAt?:       string,
  notes?:          string,
  callbackDueAt?:  string,
  callbackNote?:   string,
): Promise<void> {
  const adminDb = getAdminDb();
  if (!adminDb) throw new Error('Firebase Admin not initialized.');

  const docRef = adminDb.collection(COLLECTIONS.LEADS).doc(leadId);
  const now    = new Date();
  const nowIso = now.toISOString();

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
      updates.nextAvailableAt = callbackDueAt ?? recallAt ?? nowIso;
      updates.callbackDueAt   = callbackDueAt ?? recallAt ?? nowIso;
      updates.ownerAgentId    = agentId;
      updates.callbackNote    = callbackNote ?? notes ?? '';
      updates.retryCount      = FieldValue.increment(1);
      break;
    case 'NO_ANSWER':
      updates.status          = 'CALLBACK_AUTO';
      updates.nextAvailableAt = new Date(now.getTime() + 2 * 3600_000).toISOString();
      updates.retryCount      = FieldValue.increment(1);
      break;
    case 'BUSY':
      updates.status          = 'CALLBACK_AUTO';
      updates.nextAvailableAt = new Date(now.getTime() + 5 * 60_000).toISOString();
      updates.retryCount      = FieldValue.increment(1);
      break;
    case 'VOICEMAIL':
      updates.status          = 'CALLBACK_AUTO';
      updates.nextAvailableAt = new Date(now.getTime() + 24 * 3600_000).toISOString();
      updates.retryCount      = FieldValue.increment(1);
      break;
    default:
      updates.status     = 'CALLBACK_AUTO';
      updates.retryCount = FieldValue.increment(1);
  }

  const snap    = await docRef.get();
  const retries = ((snap.data()?.retryCount ?? 0) as number) + 1;
  if (retries > MAX_RETRIES && !['CLOSED', 'BLACKLISTED'].includes(updates.status as string)) {
    updates.status = 'EXHAUSTED';
  }

  await docRef.update(updates);
}
