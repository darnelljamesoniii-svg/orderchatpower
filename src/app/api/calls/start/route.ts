import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { getSwClient, buildOutboundLaML, getFromNumber } from '@/lib/signalwire-server';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function inferBaseUrl(req: Request) {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : '';
}

/**
 * Normalize to E.164.
 * - Keeps leading + if present
 * - Strips spaces, parens, dashes
 * - If 10 digits, assumes US and prepends +1
 */
function normalizeE164(input: string): string {
  const raw = (input ?? '').toString().trim();
  if (!raw) return '';

  // Keep +, strip everything else non-digit
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/[^\d]/g, '');

  if (hasPlus) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  // fallback: if it already looks like country+number without plus
  if (digits.length >= 11) return `+${digits}`;
  return raw; // let upstream error if it’s truly invalid
}

export async function POST(req: Request) {
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();

  try {
    const body = await req.json().catch(() => ({}));
    const { leadId, agentId } = body as { leadId?: string; agentId?: string };

    if (!leadId || !agentId) {
      return NextResponse.json({ ok: false, error: 'Missing leadId/agentId' }, { status: 400 });
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ ok: false, error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    // ---- Idempotency lock (prevents double call within ~30s) ----
    // No index required because we use a deterministic doc id (no query).
    const bucket = Math.floor(Date.now() / 30_000); // 30-second window
    const callLogId = `${leadId}_${agentId}_${bucket}`;
    const callLogsCol = adminDb.collection(COLLECTIONS.CALL_LOGS || 'call_logs');
    const callLogRef = callLogsCol.doc(callLogId);

    // Try to reserve the lock (or reuse if already created)
    const existing = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(callLogRef);
      if (snap.exists) {
        const data = snap.data() as any;
        return { exists: true, callSid: data?.callSid ?? null, status: data?.status ?? null };
      }
      tx.set(callLogRef, {
        leadId,
        agentId,
        status: 'CREATING',
        startedAt: startedAtIso,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { exists: false, callSid: null, status: 'CREATING' };
    });

    // If a duplicate request comes in while the first is still working, return whatever we have
    if (existing.exists) {
      return NextResponse.json({
        ok: true,
        callSid: existing.callSid,
        deduped: true,
        status: existing.status,
      });
    }

    // ---- Load lead ----
    const leadSnap = await adminDb.collection(COLLECTIONS.LEADS).doc(leadId).get();
    if (!leadSnap.exists) {
      await callLogRef.set(
        { status: 'FAILED', error: 'Lead not found', updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return NextResponse.json({ ok: false, error: 'Lead not found' }, { status: 404 });
    }

    const lead = leadSnap.data() as any;

    const toNumberRaw = (lead?.phone ?? '').toString().trim();
    const toNumber = normalizeE164(toNumberRaw);
    if (!toNumber || !toNumber.startsWith('+')) {
      await callLogRef.set(
        { status: 'FAILED', error: 'Lead missing/invalid phone', toNumberRaw, updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return NextResponse.json({ ok: false, error: 'Lead missing/invalid phone' }, { status: 400 });
    }

    const baseUrl = process.env.PUBLIC_BASE_URL?.trim() || inferBaseUrl(req);
    if (!baseUrl) {
      await callLogRef.set(
        { status: 'FAILED', error: 'Unable to determine base URL', updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return NextResponse.json({ ok: false, error: 'Unable to determine base URL' }, { status: 500 });
    }

    const statusUrl = `${baseUrl}/api/calls/status`;

    // Get + normalize FROM
    const fromNumber = normalizeE164(getFromNumber());
    if (!fromNumber || !fromNumber.startsWith('+')) {
      await callLogRef.set(
        { status: 'FAILED', error: 'Invalid SIGNALWIRE_PHONE_NUMBER (must be E.164)', updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      return NextResponse.json(
        { ok: false, error: 'Invalid SIGNALWIRE_PHONE_NUMBER (must be E.164)' },
        { status: 500 }
      );
    }

    // ---- Create call ----
    const call = await getSwClient().calls.create({
      to: toNumber,
      from: fromNumber,
      // NOTE: buildOutboundLaML should set callerId=fromNumber and action=statusUrl (fine if it does)
      twiml: buildOutboundLaML(toNumber, statusUrl),
      statusCallback: statusUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    } as any);

    const callSid = (call as any)?.sid ?? null;

    await callLogRef.set(
      {
        status: 'CREATED',
        callSid,
        to: toNumber,
        from: fromNumber,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, callSid });
  } catch (err: any) {
    console.error('[/api/calls/start] Call create failed:', {
      message: err?.message,
      code: err?.code,
      status: err?.status,
      more: err,
    });

    return NextResponse.json({ ok: false, error: err?.message ?? 'Call create failed' }, { status: 500 });
  }
}
