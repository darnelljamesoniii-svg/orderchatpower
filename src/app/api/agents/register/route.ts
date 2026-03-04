import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

const adminAuth = getAdminAuth();
const adminDb = getAdminDb();

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegisterBody = {
  // preferred
  email?: string;
  displayName?: string;

  // legacy/your current UI payload
  agentName?: string;

  role?: "rep" | "supervisor" | string;
  supervisorUid?: string | null; // optional now
  tempPassword?: string;

  // optional: if you ever pass it, we’ll store it as createdBy
  agentId?: string; // legacy
};

export async function POST(req: NextRequest) {
  const { COLLECTIONS } = await import("@/lib/collections");
  const { sendEmail } = await import("@/lib/resend");

  try {
    let body: RegisterBody | null = null;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const email = body?.email?.trim();
    const displayName = (body?.displayName ?? body?.agentName ?? "").trim();
    const role = (body?.role ?? "rep") as string;

    // supervisorUid is OPTIONAL now (you said you don't need linking yet)
    const supervisorUid = (body?.supervisorUid ?? null) as string | null;

    if (!email || !displayName) {
      return NextResponse.json(
        { error: "email, displayName required" },
        { status: 400 }
      );
    }

    const password = body?.tempPassword?.trim() || generatePassword();

    // Create Firebase Auth user
    const fbUser = await adminAuth.createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });

    const now = new Date().toISOString();

    // Create USERS doc
    await adminDb.collection(COLLECTIONS.USERS).doc(fbUser.uid).set({
      uid: fbUser.uid,
      email,
      displayName,
      role,
      agentId: fbUser.uid,
      createdAt: now,
      createdBy: supervisorUid, // null if not provided
      active: true,
    });

    // Create AGENTS doc for reps
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

    // Email (non-fatal)
    let emailSent = false;
    if (process.env.RESEND_API_KEY) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
        await sendEmail({
          to: email,
          subject: "Your AgenticLife Power Dialer account is ready",
          body:
            `Hi ${displayName}\n\n` +
            "Your account has been created. Here are your login details:\n\n" +
            `Email: ${email}\n` +
            `Temp Password: ${password}\n\n` +
            `Login at: ${appUrl}/login\n\n` +
            "Change your password after your first login.\n\n" +
            "Welcome to the team!",
        });
        emailSent = true;
      } catch (e) {
        console.error("[agents/register] Email send failed (non-fatal):", e);
      }
    }

    // NOTE: returning password is convenient, but consider removing later.
    return NextResponse.json({
      success: true,
      uid: fbUser.uid,
      email,
      password,
      emailSent,
    });
  } catch (err: unknown) {
    console.error("[/api/agents/register]", err);
    const message = err instanceof Error ? err.message : "Failed to create user";
    const code = (err as { code?: string }).code;

    if (code === "auth/email-already-exists") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function generatePassword(): string {
  const words = ["Rocket", "Storm", "Blaze", "Swift", "Force", "Apex", "Surge", "Titan", "Pulse", "Nova"];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `${word}${digits}`;
}
