'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ConciergeAnswers } from '@/lib/gemini-concierge';

type NearbyPlace = {
  placeId: string;
  name: string;
  category?: string;
  rating?: number;
  distanceMetres?: number;
  address?: string;
  priceLevel?: number;
};

type Business = {
  name: string;
  address: string;
  category?: string;
};

type CompetitionResponse = {
  ok?: boolean;
  business?: Business;
  competitors?: {
    tier1: NearbyPlace[];
    tier2: NearbyPlace[];
    tier3: NearbyPlace[];
  };
};

type Message = {
  id: string;
  role: 'bot' | 'user';
  text: string;
  options?: string[];
};

type RecommendationPayload = {
  recommendation?: {
    place: NearbyPlace;
    reason: string;
  };
  details?: {
    name?: string;
    address?: string;
    priceLevel?: number;
    category?: string;
  };
};

type StageDef = {
  stage: 'cuisine' | 'vibe' | 'budget' | 'travelMode' | 'travelRange' | 'dietary';
  key: keyof ConciergeAnswers;
  options: string[];
};

function miles(m?: number): string {
  if (!m) return '';
  return `${(m / 1609.34).toFixed(1)} mi`;
}

function priceSymbols(level?: number): string {
  if (level === undefined) return '$$';
  return ['', '$', '$$', '$$$', '$$$$'][level] || '$$';
}

function mapAnswers(input: Record<string, string>): ConciergeAnswers {
  const modeRaw = (input.travelMode || 'Dine in').toLowerCase();
  const travelMode: ConciergeAnswers['travelMode'] = modeRaw.includes('delivery')
    ? 'delivery'
    : modeRaw.includes('takeout')
      ? 'drive'
      : 'walk';

  return {
    cuisine: input.cuisine || 'Surprise me',
    vibe: input.vibe || 'Casual and relaxed',
    budget: input.budget || 'Moderate ($$)',
    mood: input.vibe || 'Casual and relaxed',
    travelMode,
    travelRange: input.travelRange || 'Up to 15 min',
    dietary: input.dietary || 'No restrictions',
  };
}

function ConciergePageContent() {
  const params = useSearchParams();
  const placeId = params.get('place_id') ?? '';
  const name = params.get('name') ?? '';
  const address = params.get('address') ?? '';
  const keyword = (params.get('keyword') ?? '').trim();

  const [business, setBusiness] = useState<Business>({
    name: name || 'DinerConcierge',
    address: address || 'Orlando, FL',
    category: 'restaurant',
  });
  const [candidates, setCandidates] = useState<NearbyPlace[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [recommended, setRecommended] = useState<NearbyPlace | null>(null);
  const [recDetails, setRecDetails] = useState<RecommendationPayload['details'] | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const flow = useMemo<StageDef[]>(
    () => [
      { stage: 'cuisine', key: 'cuisine', options: ['Asian', 'American', 'Italian', 'Mexican'] },
      { stage: 'vibe', key: 'vibe', options: ['Trendy and Hip', 'Casual and Relaxed', 'Family Friendly', 'Date Night'] },
      { stage: 'budget', key: 'budget', options: ['Budget ($)', 'Moderate ($$)', 'Upscale ($$$)'] },
      { stage: 'travelMode', key: 'travelMode', options: ['Dine in', 'Takeout', 'Delivery'] },
      { stage: 'travelRange', key: 'travelRange', options: ['Up to 15 min', 'Up to 30 min', 'Any distance'] },
      { stage: 'dietary', key: 'dietary', options: ['No restrictions', 'Vegetarian', 'Vegan', 'Gluten free'] },
    ],
    [],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, recommended]);

  const addBot = (text: string, options?: string[]) => {
    setMessages((prev) => [...prev, { id: `b-${Date.now()}-${Math.random()}`, role: 'bot', text, options }]);
  };

  const addUser = (text: string) => {
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: 'user', text }]);
  };

  const fetchTurnText = async (stage: string, answers: Partial<ConciergeAnswers>): Promise<string> => {
    try {
      const res = await fetch('/api/concierge/chat-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: business.name, stage, answers }),
      });
      const data = await res.json();
      return data?.text || '';
    } catch {
      return '';
    }
  };

  useEffect(() => {
    let alive = true;

    const load = async () => {
      if (!placeId) {
        setLoading(false);
        return;
      }

      try {
        const qs = new URLSearchParams();
        qs.set('place_id', placeId);
        if (name) qs.set('name', name);
        if (address) qs.set('address', address);
        if (keyword) qs.set('keyword', keyword);
        qs.set('refresh', '1');

        const res = await fetch(`/api/competition?${qs.toString()}`);
        const data = (await res.json()) as CompetitionResponse;

        if (!alive) return;

        if (data.business) setBusiness(data.business);
        const pool = [
          ...(data.competitors?.tier1 ?? []),
          ...(data.competitors?.tier2 ?? []),
          ...(data.competitors?.tier3 ?? []),
        ];

        const deduped = Array.from(new Map(pool.map((p) => [p.placeId, p])).values());
        setCandidates(deduped.slice(0, 24));
      } catch {
        // keep defaults
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [placeId, name, address, keyword]);

  useEffect(() => {
    if (loading || messages.length > 0) return;

    const start = async () => {
      const welcome = await fetchTurnText('welcome', {});
      addBot(welcome || "Hey there! I'm your DinerConcierge. I'll ask a few quick questions to find your best match.");

      const firstQ = await fetchTurnText(flow[0].stage, {});
      addBot(firstQ || 'What type of cuisine are you in the mood for?', flow[0].options);
      setStep(0);
    };

    void start();
  }, [loading, messages.length, flow]);

  const runRecommendation = async (nextPicked: Record<string, string>) => {
    const answers = mapAnswers(nextPicked);
    const finalLead = await fetchTurnText('final', answers);
    addBot(finalLead || "Love it, thanks. I'm finding your best match now.");

    try {
      const res = await fetch('/api/concierge/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers,
          candidates,
          excludePlaceId: placeId || undefined,
        }),
      });

      const data = (await res.json()) as RecommendationPayload;
      const rec = data.recommendation?.place ?? null;
      const reason = data.recommendation?.reason;

      if (rec) {
        setRecommended(rec);
        setRecDetails(data.details ?? null);
        if (reason) addBot(reason);
      } else {
        addBot('I could not find a strong match yet. Try a broader distance and I will run it again.');
      }
    } catch {
      addBot('I had trouble fetching recommendations right now. Please try again in a moment.');
    }
  };

  const handleOption = async (value: string) => {
    if (recommended) return;

    const stage = flow[step];
    addUser(value);

    const nextPicked = { ...picked, [stage.key]: value };
    setPicked(nextPicked);

    const nextStep = step + 1;
    if (nextStep < flow.length) {
      const answers = mapAnswers(nextPicked);
      const nextStage = flow[nextStep];
      const text = await fetchTurnText(nextStage.stage, answers);
      addBot(text || `Great, let's do the next one.`, nextStage.options);
      setStep(nextStep);
      return;
    }

    await runRecommendation(nextPicked);
  };

  return (
    <main className="min-h-screen bg-[#efede8] p-4 md:p-6">
      <div className="mx-auto max-w-4xl rounded-2xl border border-[#dfd9cf] bg-[#f5f3ee] shadow-sm">
        <header className="flex items-center justify-between border-b border-[#e3ddd2] px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#ff7a12] text-white grid place-items-center text-sm font-bold">DC</div>
            <div>
              <div className="text-2xl font-semibold text-[#1f1a14]">DinerConcierge</div>
              <div className="text-sm text-[#6c6257]">Your personal food finder</div>
            </div>
          </div>
          <div className="text-sm text-[#7c6f61]">{business.name}</div>
        </header>

        <section className="max-h-[74vh] overflow-y-auto px-3 py-4 md:px-6 md:py-5">
          {messages.map((m) => (
            <div key={m.id} className={`mb-4 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[86%] ${m.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
                <div
                  className={
                    m.role === 'user'
                      ? 'rounded-2xl rounded-br-md bg-[#ff7a12] px-4 py-3 text-white shadow-sm'
                      : 'rounded-2xl rounded-bl-md bg-[#f2efe8] px-4 py-3 text-[#2a2118] shadow-sm border border-[#ebe5dc]'
                  }
                >
                  <p className="text-[22px] leading-8 md:text-[30px] md:leading-[1.45]">{m.text}</p>
                </div>

                {m.options && m.role === 'bot' && !recommended && (
                  <div className="flex flex-wrap gap-2">
                    {m.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => void handleOption(opt)}
                        className="rounded-full border border-[#ffbe84] bg-[#fff4e8] px-3 py-1.5 text-xs font-medium text-[#cc5f0c] hover:bg-[#ffe7cf]"
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {recommended && (
            <div className="mt-4 max-w-[420px] rounded-3xl border border-[#dfd9cf] bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="text-xl font-semibold text-[#2b2219]">{recDetails?.name || recommended.name}</h3>
                <span className="rounded-full bg-[#1ba9a3] px-3 py-1 text-xs font-semibold text-white">
                  {recDetails?.category || recommended.category || 'Restaurant'}
                </span>
              </div>
              <div className="text-sm text-[#7a6d5d]">{priceSymbols(recDetails?.priceLevel ?? recommended.priceLevel)}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#7a6d5d]">
                <span className="rounded-full border border-[#e6dcc9] bg-[#f9f2e5] px-2 py-1">Top rated</span>
                <span className="rounded-full border border-[#e6dcc9] bg-[#f9f2e5] px-2 py-1">{miles(recommended.distanceMetres)}</span>
              </div>
              <div className="mt-2 text-sm text-[#7a6d5d]">{recDetails?.address || business.address}</div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(recDetails?.name || recommended.name)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block w-full rounded-full bg-[#ff9c21] px-4 py-2 text-center text-sm font-semibold text-white hover:brightness-95"
              >
                Directions
              </a>
            </div>
          )}

          <div ref={bottomRef} />
        </section>
      </div>
    </main>
  );
}

export default function ConciergePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#efede8]" />}>
      <ConciergePageContent />
    </Suspense>
  );
}
