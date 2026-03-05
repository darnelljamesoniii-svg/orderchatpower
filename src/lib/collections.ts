import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Initialize DB inside try block to catch init errors
    const adminDb = getAdminDb();
    if (!adminDb) {
      throw new Error("Firebase Admin SDK failed to initialize. Check environment variables.");
    }

    // 2. Parse and validate body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const { agentId } = body;
    if (!agentId) {
      return NextResponse.json({ error: "agentId is required" }, { status: 400 });
    }

    // 3. Resolve collections dynamically
    const { COLLECTIONS } = await import("@/lib/collections");
    if (!COLLECTIONS?.LEADS || !COLLECTIONS?.AGENTS) {
      throw new Error("Required collection constants (LEADS/AGENTS) are missing from @/lib/collections");
    }

    // 4. Fetch leads
    // We fetch leads that haven't been completed. 
    // Note: To prevent agents from getting the same lead, you'd eventually filter by status.
    const leadsSnapshot = await adminDb
      .collection(COLLECTIONS.LEADS)
      .limit(1)
      .get();

    if (leadsSnapshot.empty) {
      return NextResponse.json({ 
        success: true, 
        lead: null, 
        message: "Queue empty" 
      });
    }

    const leadDoc = leadsSnapshot.docs[0];
    const leadData = leadDoc.data();

    // 5. Update Agent record and mark the lead as "in-progress" if needed
    // Using a batch or sequential updates to ensure the agent is linked to this lead
    await adminDb.collection(COLLECTIONS.AGENTS).doc(agentId).set({
      currentLeadId: leadDoc.id,
      lastAction: 'fetching_lead',
      lastSeen: new Date().toISOString(),
      status: 'BUSY' // Agent is now occupied with a lead
    }, { merge: true });

    // 6. Return the lead
    return NextResponse.json({
      success: true,
      lead: {
        id: leadDoc.id,
        ...leadData,
      },
    });

  } catch (err: any) {
    // Comprehensive logging for Vercel Dashboard
    console.error("[/api/leads/next] Internal Error:", {
      message: err.message,
      stack: err.stack,
      code: err.code
    });
    
    return NextResponse.json(
      { 
        error: "Internal Server Error", 
        message: err.message,
        // Only include details in dev or for debugging
        debug: process.env.NODE_ENV === 'development' ? err.stack : undefined
      },
      { status: 500 }
    );
  }
}
