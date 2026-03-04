// src/app/api/signalwire/token/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { generateAccessToken } from "@/lib/signalwire-server";
import { getNextCallerId } from "@/lib/getNextCallerId"; // <-- keep if you have this

export async function POST(req: Request) {
  const { agentId } = await req.json();

  const [token, callerId] = await Promise.all([
    generateAccessToken(agentId ?? "agent"),
    getNextCallerId(),
  ]);

  return NextResponse.json({ token, callerId });
}
