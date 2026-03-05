export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * POST /api/signalwire/token
 * Body: { agentId?: string }
 * Returns: { token: string }
 */
export async function POST(req: Request) {
  try {
    const body: any = await req.json().catch(() => ({}));
    const agentId =
      typeof body?.agentId === "string" && body.agentId.trim()
        ? body.agentId.trim()
        : "agent";

    // IMPORTANT: avoid top-level import crashing the route
    const { generateAccessToken } = await import("@/lib/signalwire-server");

    const token = await generateAccessToken(agentId);
    return NextResponse.json({ token }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Token generation failed" },
      { status: 500 }
    );
  }
}

// Optional: helpful GET response
export async function GET() {
  return NextResponse.json(
    { ok: true, message: "Use POST with JSON body: { agentId: string }" },
    { status: 200 }
  );
}
