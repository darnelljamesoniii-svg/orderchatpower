import { GoogleGenerativeAI } from '@google/generative-ai';
import type { NearbyPlace } from '@/lib/google-places';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export interface ConciergeAnswers {
  mood: string; // e.g. "Comfort Food"
  travelMode: 'walk' | 'drive' | 'delivery';
  travelRange: string; // e.g. "10 minutes" | "3 miles"
  cuisine: string; // e.g. "Pizza" | "Surprise me"
  dietary: string; // e.g. "Vegetarian" | "No restrictions"
  vibe: string; // e.g. "Date night"
  budget?: string; // e.g. "Moderate ($$)"
}

export interface RecommendationResult {
  place: NearbyPlace;
  reason: string; // Gemini's 1-sentence personalized reason
  highlightedReview?: string;
}

/**
 * Consumer mode: Pick the BEST matching restaurant from candidates.
 * Business owner demo mode: Pick a competitor (exclude the owner's place_id).
 */
export async function getRecommendation(
  answers: ConciergeAnswers,
  candidates: NearbyPlace[],
  excludePlaceId?: string,
): Promise<RecommendationResult | null> {
  if (candidates.length === 0) return null;

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // Filter out the excluded place (business owner demo mode)
  const pool = excludePlaceId ? candidates.filter((c) => c.placeId !== excludePlaceId) : candidates;
  if (pool.length === 0) return null;

  const candidateList = pool
    .slice(0, 15)
    .map(
      (p, i) =>
        `${i + 1}. ${p.name} | category: ${p.category} | rating: ${p.rating ?? 'N/A'} | distance: ${Math.round(
          p.distanceMetres ?? 0,
        )}m | open: ${p.openNow ?? 'unknown'} | price: ${'$'.repeat(p.priceLevel ?? 1)}`,
    )
    .join('\n');

  const prompt = `You are an expert dining concierge. Based on the customer's preferences, pick the SINGLE best restaurant from the list below.

Customer preferences:
- Mood tonight: ${answers.mood}
- Travel method: ${answers.travelMode}
- Travel range: ${answers.travelRange}
- Cuisine craving: ${answers.cuisine}
- Dietary needs: ${answers.dietary}
- Vibe: ${answers.vibe}
- Budget: ${answers.budget ?? 'Not specified'}

Candidate restaurants:
${candidateList}

Rules:
- Pick the ONE best match by number
- Write a warm, personal 1-sentence reason (max 25 words) explaining why THIS place fits THEIR specific preferences tonight
- Do not mention the number in your reason
- Sound like a knowledgeable local friend, not a robot
${excludePlaceId ? '- IMPORTANT: You are showing this to a business owner as a demo. Pick whichever competitor best fits, NOT their own restaurant.' : ''}

Respond ONLY with valid JSON, no markdown:
{"pick": <number>, "reason": "<sentence>"}`;

  try {
    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().replace(/```json\n?|```\n?/g, '');
    const parsed = JSON.parse(raw) as { pick: number; reason: string };
    const chosen = pool[parsed.pick - 1] ?? pool[0];

    return {
      place: chosen,
      reason: parsed.reason,
    };
  } catch {
    // Fallback: pick highest rated open place
    const fallback = pool.filter((p) => p.openNow !== false).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ?? pool[0];

    return {
      place: fallback,
      reason: `${fallback.name} is highly rated and a great match for your evening.`,
    };
  }
}

export interface ChatTurnInput {
  businessName?: string;
  stage: 'welcome' | 'cuisine' | 'vibe' | 'budget' | 'travelMode' | 'travelRange' | 'dietary' | 'final';
  answers?: Partial<ConciergeAnswers>;
}

/**
 * Generate upbeat concierge copy for each chat turn.
 * We keep options deterministic in UI, while Gemini controls tone and phrasing.
 */
export async function getConciergeTurnText(input: ChatTurnInput): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are DinerConcierge, a super friendly and upbeat dining concierge.
Write ONE short message (max 26 words), natural and warm.
No markdown. No JSON. No bullets.

Business name context: ${input.businessName || 'local area'}
Current stage: ${input.stage}
Known answers:
- cuisine: ${input.answers?.cuisine ?? 'unknown'}
- vibe: ${input.answers?.vibe ?? 'unknown'}
- budget: ${input.answers?.budget ?? 'unknown'}
- travel mode: ${input.answers?.travelMode ?? 'unknown'}
- travel range: ${input.answers?.travelRange ?? 'unknown'}
- dietary: ${input.answers?.dietary ?? 'unknown'}

If stage=welcome, introduce yourself and say you'll ask a few quick questions.
If stage=final, do not recommend a place yet; just tee up that you're finding the best match now.
Return only the message text.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || 'Awesome, I have what I need. Let me find your best match.';
  } catch {
    const fallback: Record<ChatTurnInput['stage'], string> = {
      welcome: "Hey there! I'm your DinerConcierge. I'll ask a few quick questions and find you a great spot.",
      cuisine: 'Great! What type of cuisine are you craving?',
      vibe: 'Perfect. What kind of vibe are you looking for tonight?',
      budget: "Awesome. What's your budget for this meal?",
      travelMode: 'Got it. How do you want to enjoy this meal?',
      travelRange: 'How far are you willing to travel?',
      dietary: 'Any dietary preferences I should know about?',
      final: "Love it, thanks. I'm finding your best match now.",
    };
    return fallback[input.stage];
  }
}

/**
 * Generate the "sting" message shown on the business owner LP
 * after seeing their competitor get recommended.
 */
export async function generateStingMessage(
  ownerName: string,
  competitorName: string,
  competitorCount: number,
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `Write a punchy 2-sentence message for a restaurant owner named "${ownerName}".
A customer just searched nearby and was recommended "${competitorName}" instead of them.
There are ${competitorCount} competitors in their immediate area.
Make it feel urgent and real - not scary, but motivating. Max 40 words total.
Return only the plain text, no quotes, no formatting.`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return `While you were reading this, a hungry customer nearby just got sent to ${competitorName}. With ${competitorCount} competitors in your area, this happens dozens of times a day.`;
  }
}
