import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error("Missing env: " + name);
  return v;
}

export async function POST(req: NextRequest) {
  const { adminAuth, adminDb } = await import("@/lib/firebase-admin");
  const { COLLECTIONS } = await import("@/lib/collections");
  const { sendEmail } = await import("@/lib/resend");

  try {
    const { email, displayName, role = "rep", supervisorUid, tempPassword } = await req.json();

    if (!email || !displayName || !supervisorUid) {
      return NextResponse.json({ error: "email, displayName, supervisorUid required" }, { status: 400 });
    }

    const supervisorSnap = await adminDb.collection(COLLECTIONS.USERS).doc(supervisorUid).get();
    if (!supervisorSnap.exists || supervisorSnap.data()?.role !== "supervisor") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const password = tempPassword ?? generatePassword();

    const fbUser = await adminAuth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });

    const now = new Date().toISOString();

    await adminDb.collection(COLLECTIONS.USERS).doc(fbUser.uid).set({
      uid: fbUser.uid,
      email,
      displayName,
      role,
      agentId: fbUser.uid,
      createdAt: now,
      createdBy: supervisorUid,
      active: true,
    });

    if (role === "rep") {
      await adminDb.collection(COLLECTIONS.AGENTS).doc(fbUser.uid).set({
        id: fbUser.uid,
        name: displayName,
        email,
        status: "OFFLINE",
        callsToday: 0,
        revenueToday: 0,
        talkTimeSeconds: 0,
        createdAt: now,
      });
    }

    let emailSent = false;
    if (process.env.RESEND_API_KEY) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        await sendEmail({
          to: email,
          subject: "Your AgenticLife Power Dialer account is ready",
          body: Hi ,\n\nYour account has been created. Here are your login details:\n\nEmail: \nTemp Password: \n\nLogin at: /login\n\nChange your password after your first login.\n\nWelcome to the team!,
        });
        emailSent = true;
      } catch (e) {
        console.error("[agents/register] Email send failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ success: true, uid: fbUser.uid, email, password, emailSent });
  } catch (err: unknown) {
    console.error("[/api/agents/register]", err);
    const message = err instanceof Error ? err.message : "Failed to create user";
    const code = (err as { code?: string }).code;
    if (code === "auth/email-already-exists") {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function generatePassword(): string {
  const words = ["Rocket","Storm","Blaze","Swift","Force","Apex","Surge","Titan","Pulse","Nova"];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return ${word};
}
