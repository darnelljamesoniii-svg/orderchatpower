import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

const adminDb = getAdminDb();

export async function POST(req: NextRequest) {
  const { COLLECTIONS } = await import("@/lib/collections");
  
  try {
    const { agentId, agentName, email } = await req.json();

    if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });

    const userRef = adminDb.collection(COLLECTIONS.USERS).doc(agentId);
    const doc = await userRef.get();

    // If the doc doesn't exist, create it. If it does, just update the status.
    if (!doc.exists) {
      await userRef.set({
        uid: agentId,
        email: email ?? "",
        displayName: agentName ?? "Unknown Agent",
        role: "rep",
        active: true,
        createdAt: new Date().toISOString(),
      }, { merge: true });
    }

    // Ensure the AGENT record exists for the dialer
    await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).set({
      id: agentId,
      name: agentName,
      email: email ?? "",
      status: "AVAILABLE", // Set them to available on login
      lastSeen: new Date().toISOString(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[api/agents/sync]", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
