import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/collections';
import { sendEmail } from '@/lib/resend';

export const dynamic = 'force-dynamic';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://agenticlife.com';

function isWithinBusinessHours(campaignStartHour = 9, campaignEndHour = 20): boolean {
  const utcHour = new Date().getUTCHours();
  // Default to EST (UTC-5) for business hours check
  const localHour = (utcHour - 5 + 24) % 24;
  return localHour >= campaignStartHour && localHour < campaignEndHour;
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, placeId, agentId } = await req.json();
    if (!sessionId || !placeId) {
      return NextResponse.json({ error: 'sessionId and placeId required' }, { status: 400 });
    }

    // Find the lead by placeId (kgmid)
    const leadsSnap = await adminDb
      .collection(COLLECTIONS.LEADS)
      .where('kgmid', '==', placeId)
      .limit(1)
      .get();

    const lead     = leadsSnap.empty ? null : leadsSnap.docs[0].data();
    const leadId   = leadsSnap.empty ? null : leadsSnap.docs[0].id;
    const ownerId  = agentId ?? lead?.assignedAgentId ?? lead?.ownerAgentId ?? null;
    const bizName  = lead?.businessName ?? 'A prospect';
    const unlockUrl = `${APP_URL}/unlock?place_id=${encodeURIComponent(placeId)}&sessionId=${encodeURIComponent(sessionId)}`;

    const inHours = isWithinBusinessHours();

    if (inHours && ownerId) {
      // Write alert to agent's subcollection — Battle Station subscribes to this
      await adminDb
        .collection(COLLECTIONS.AGENTS)
        .doc(ownerId)
        .collection('alerts')
        .add({
          type:        'return_visit',
          leadId:      leadId ?? null,
          businessName: bizName,
          message:     `🔥 ${bizName} just returned to their demo page!`,
          placeId,
          sessionId,
          createdAt:   new Date().toISOString(),
          read:        false,
        });
    } else {
      // Outside hours — email the team
      await sendEmail({
        to:      process.env.EMAIL_REPLY_TO ?? 'team@agenticlife.com',
        subject: `Return visit after hours: ${bizName}`,
        body:    `${bizName} just returned to their zone analysis page.\n\nTime: ${new Date().toLocaleString()}\nLP Link: ${unlockUrl}\n\nFollow up first thing tomorrow morning.`,
        placeId,
        sessionId,
      });
    }

    return NextResponse.json({ ok: true, inHours });
  } catch (err: unknown) {
    console.error('[/api/sessions/return-alert]', err);
    return NextResponse.json({ error: 'Alert failed' }, { status: 500 });
  }
}
