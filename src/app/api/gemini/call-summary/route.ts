import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { GoogleGenerativeAI } from '@google/generative-ai';
export const runtime = 'nodejs';
import { getAdminDb } from '@/lib/firebase-admin';
export const runtime = 'nodejs';
const adminDb = getAdminDb();
import { COLLECTIONS } from '@/lib/collections';
export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { callLogId } = await req.json();
    if (!callLogId) return NextResponse.json({ error: 'callLogId required' }, { status: 400 });

    const logSnap = await adminDb.collection(COLLECTIONS.CALL_LOGS).doc(callLogId).get();
    if (!logSnap.exists) return NextResponse.json({ error: 'Call log not found' }, { status: 404 });

    const log = logSnap.data()!;

    // Only coach calls >= 2 minutes
    if ((log.durationSeconds ?? 0) < 120) {
      return NextResponse.json({ skipped: true, reason: 'Call too short for coaching' });
    }

    const transcript = (log.transcript ?? [])
      .map((e: { speaker: string; text: string }) => `${e.speaker.toUpperCase()}: ${e.text}`)
      .join('\n');

    if (!transcript.trim()) {
      return NextResponse.json({ skipped: true, reason: 'No transcript available' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a sales coaching AI. Analyze this sales call transcript and provide structured feedback.

Call Duration: ${Math.floor((log.durationSeconds ?? 0) / 60)}m ${(log.durationSeconds ?? 0) % 60}s
Disposition: ${log.disposition ?? 'Unknown'}

TRANSCRIPT:
${transcript}

Provide your analysis as valid JSON only (no markdown, no backticks):
{
  "summary": "2-3 sentence plain English summary of the call",
  "objections": ["each objection the lead raised, verbatim or close to it"],
  "coachingTips": [
    "specific, actionable tip based on what happened",
    "another tip"
  ],
  "strengths": ["what the agent did well"],
  "score": <number 1-10 overall call quality>
}`;

    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim().replace(/```json\n?|```\n?/g, '');

    let parsed: {
      summary: string;
      objections: string[];
      coachingTips: string[];
      strengths: string[];
      score: number;
    };

    try {
      parsed = JSON.parse(raw);
    } catch {
      // Gemini returned non-JSON â€” store raw
      parsed = {
        summary:      raw.slice(0, 500),
        objections:   [],
        coachingTips: [],
        strengths:    [],
        score:        5,
      };
    }

    // Write back to call log â€” never throws, failure is non-fatal
    await adminDb.collection(COLLECTIONS.CALL_LOGS).doc(callLogId).update({
      summary:      parsed.summary,
      coachingTips: parsed.coachingTips,
      objections:   parsed.objections,
      strengths:    parsed.strengths,
      callScore:    parsed.score,
      coachedAt:    new Date().toISOString(),
    });

    return NextResponse.json({ success: true, score: parsed.score });
  } catch (err: unknown) {
    // Never propagate â€” this is fire-and-forget
    console.error('[/api/gemini/call-summary]', err);
    return NextResponse.json({ error: 'Coaching failed silently' }, { status: 200 });
  }
}


