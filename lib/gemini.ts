import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const SYSTEM_PROMPT = `You are an elite sales coach AI embedded in a live call dialer. 
An agent is speaking with a business owner right now. You receive the live transcript.
Detect any objection or resistance and respond with:
1. A punchy rebuttal (≤40 words) the agent can say verbatim
2. A powerful follow-up question (≤25 words)  
3. Tone advice in 8 words or fewer

Return ONLY valid JSON with keys: rebuttal, followUp, toneAdvice
No markdown, no explanation, just the JSON object.`;

export interface BattleCard {
  rebuttal:    string;
  followUp:    string;
  toneAdvice:  string;
}

/**
 * Generate a battle card from the last few lines of transcript.
 */
export async function generateBattleCard(
  recentTranscript: string,
  businessType: string = 'local business',
): Promise<BattleCard> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Business type: ${businessType}
Recent call transcript:
${recentTranscript}

Generate the battle card JSON now:`;

  const result = await model.generateContent([
    { text: SYSTEM_PROMPT },
    { text: prompt },
  ]);

  const raw = result.response.text().trim();

  // Strip markdown fences if present
  const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();

  try {
    return JSON.parse(cleaned) as BattleCard;
  } catch {
    return {
      rebuttal:   'I understand your concern. Most of our clients felt the same until they saw the results. Can I share a quick example?',
      followUp:   'What would change if your Google ranking doubled next month?',
      toneAdvice: 'Stay calm, slow down.',
    };
  }
}
