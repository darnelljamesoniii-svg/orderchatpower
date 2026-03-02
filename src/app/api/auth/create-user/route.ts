import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
const adminAuth = getAdminAuth();
const adminDb = getAdminDb();
export const runtime = 'nodejs';
import { COLLECTIONS } from '@/lib/collections';
export const runtime = 'nodejs';
import { sendEmail } from '@/lib/resend';
export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const {
      email,
      displayName,
      role = 'rep',
      supervisorUid,
      tempPassword,
    } = await req.json();

    if (!email || !displayName || !supervisorUid) {
      return NextResponse.json(
        { error: 'email, displayName, supervisorUid required' },
        { status: 400 },
      );
    }

    // Verify the caller is actually a supervisor
    const supervisorSnap = await adminDb
      .collection(COLLECTIONS.USERS)
      .doc(supervisorUid)
      .get();

    if (!supervisorSnap.exists || supervisorSnap.data()?.role !== 'supervisor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Generate password if not provided
    const password = tempPassword ?? generatePassword();

    // Create Firebase Auth user
    const fbUser = await adminAuth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });

    const now = new Date().toISOString();

    // Create Firestore user doc
    const userDoc = {
      uid:         fbUser.uid,
      email,
      displayName,
      role,
      agentId:     fbUser.uid, // use uid as agentId for reps
      createdAt:   now,
      createdBy:   supervisorUid,
      active:      true,
    };

    await adminDb.collection(COLLECTIONS.USERS).doc(fbUser.uid).set(userDoc);

    // Also create an agent doc for reps so they appear in live feed
    if (role === 'rep') {
      await adminDb.collection(COLLECTIONS.AGENTS).doc(fbUser.uid).set({
        id:              fbUser.uid,
        name:            displayName,
        email,
        status:          'OFFLINE',
        callsToday:      0,
        revenueToday:    0,
        talkTimeSeconds: 0,
        createdAt:       now,
      });
    }

    // Try to send welcome email if Resend is configured
    let emailSent = false;
    if (process.env.RESEND_API_KEY) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
        await sendEmail({
          to:      email,
          subject: 'Your AgenticLife Power Dialer account is ready',
          body:    `Hi ${displayName},\n\nYour account has been created. Here are your login details:\n\nEmail: ${email}\nTemp Password: ${password}\n\nLogin at: ${appUrl}/login\n\nChange your password after your first login.\n\nWelcome to the team!`,
        });
        emailSent = true;
      } catch (emailErr) {
        console.error('[create-user] Email send failed (non-fatal):', emailErr);
      }
    }

    return NextResponse.json({
      success:   true,
      uid:       fbUser.uid,
      email,
      password,  // returned so supervisor can see it on screen
      emailSent,
    });
  } catch (err: unknown) {
    console.error('[/api/auth/create-user]', err);
    const message = err instanceof Error ? err.message : 'Failed to create user';
    // Firebase Auth errors have a code property
    const code = (err as { code?: string }).code;
    if (code === 'auth/email-already-exists') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Generate a readable temp password: Word + 4 digits
function generatePassword(): string {
  const words = [
    'Rocket', 'Storm', 'Blaze', 'Swift', 'Force',
    'Apex', 'Surge', 'Titan', 'Pulse', 'Nova',
  ];
  const word   = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}${digits}`;
}


