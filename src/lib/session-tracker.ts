'use client';

// ─── LP Session Tracker ───────────────────────────────────────────────────────
// Runs on the unlock page (prospect-facing).
// Writes events to lp_sessions/{sessionId} in Firestore.
// Public write — only to own sessionId. No reads. No list queries.

import { db } from '@/lib/firebase';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

let _sessionId: string | null  = null;
let _initialized                = false;

export function initSession(sessionId: string, placeId: string, agentId?: string) {
  if (_initialized) return;
  _sessionId   = sessionId;
  _initialized = true;

  // Create the session document
  setDoc(doc(db, 'lp_sessions', sessionId), {
    sessionId,
    placeId,
    agentId:      agentId ?? null,
    loadedAt:     new Date().toISOString(),
    lastEventAt:  new Date().toISOString(),
    step:         'loaded',
    zonesExpanded:    [],
    returnVisits:     0,
  }, { merge: true }).catch(console.error);
}

async function trackEvent(fields: Record<string, unknown>) {
  if (!_sessionId) return;
  try {
    await updateDoc(doc(db, 'lp_sessions', _sessionId), {
      ...fields,
      lastEventAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[session-tracker]', e);
  }
}

export const track = {
  stingCompleted: () =>
    trackEvent({ step: 'sting_done', stingCompleted: true }),

  zoneExpanded: (zone: 'tier1' | 'tier2' | 'tier3') =>
    trackEvent({ [`zoneExpanded_${zone}`]: true, step: 'exploring_zones' }),

  avgTicketSelected: (value: number) =>
    trackEvent({ selectedAvgTicket: value, step: 'ticket_selected' }),

  tierHovered: (tierId: string) =>
    trackEvent({ tierHovered: tierId }),

  tierClicked: (tierId: string) =>
    trackEvent({ selectedTierId: tierId, step: 'pricing_opened' }),

  lockClicked: (tierId: string) =>
    trackEvent({ lockClicked: true, lockedTierId: tierId, step: 'lock_clicked' }),

  paymentOpened: () =>
    trackEvent({ paymentOpened: true, step: 'payment_opened' }),

  returnVisit: (returnCount: number) =>
    trackEvent({ returnVisits: returnCount, lastReturnAt: new Date().toISOString(), step: 'return_visit' }),
};

// ── Return visit detection ────────────────────────────────────────────────────
let _returnCount = 0;
let _firstLoad   = true;

export function initReturnVisitDetection(
  sessionId: string,
  placeId:   string,
  agentId?:  string,
) {
  if (typeof window === 'undefined') return;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !_firstLoad) {
      _returnCount++;
      track.returnVisit(_returnCount);

      // Notify the backend to alert the agent
      fetch('/api/sessions/return-alert', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sessionId, placeId, agentId }),
      }).catch(() => {});
    }
    if (_firstLoad) _firstLoad = false;
  });
}
