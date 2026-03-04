export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { generateAccessToken } from "@/lib/signalwire-server";

/**
 * POST /api/signalwire/token
 * Body: { agentId?: string }
 * Returns: { token: string }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const agentId = typeof body?.agentId === "string" && body.agentId.trim()
      ? body.agentId.trim()
      : "agent";

    const token = await generateAccessToken(agentId);

    return NextResponse.json({ token }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Token generation failed" },
      { status: 500 }
    );
  }
}

// Optional: respond nicely to GET instead of 405
export async function GET() {
  return NextResponse.json(
    { error: "Use POST with JSON body: { agentId: string }" },
    { status: 405 }
  );
}
