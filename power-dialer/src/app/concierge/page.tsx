'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { NearbyPlace, PlaceDetails } from '@/lib/google-places';
import type { ConciergeAnswers } from '@/lib/gemini-concierge';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Message {
  id:       string;
  role:     'bot' | 'user';
  text:     string;
  replies?: string[];
  input?:   'location';
}

interface RecommendationResult {
  place:   NearbyPlace;
  reason:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTimeOfDay(): 'morning' | 'lunch' | 'dinner' | 'late' {
  const h = new Date().getHours();
  if (h < 11) return 'morning';
  if (h < 14) return 'lunch';
  if (h < 21) return 'dinner';
  return 'late';
}

const MOOD_OPTIONS: Record<string, string[]> = {
  morning: ['Coffee & Breakfast ☕', 'Brunch 🥂', 'Bakery 🥐', 'Quick Bite 🥪'],
  lunch:   ['Quick Bite 🥪', 'Sit Down & Relax 🍽️', 'Something Light 🥗', 'Comfort Food 🍔'],
  dinner:  ['Comfort Food 🍔', 'Something Special ✨', 'Quick & Easy ⚡', 'Date Night 🌹'],
  late:    ['Late Night 🌙', 'Bar Food 🍻', 'Delivery 🛵', 'Quick Bite 🥪'],
};

const CUISINE_OPTIONS = ['Pizza 🍕', 'Sushi 🍣', 'Mexican 🌮', 'Indian 🍛', 'Burgers 🍔', 'Thai 🍜', 'Italian 🍝', 'Surprise me ✨'];
const DIETARY_OPTIONS = ['No restrictions 🍽️', 'Vegetarian 🥦', 'Vegan 🌱', 'Gluten-free 🌾', 'Halal ☪️', 'Kosher ✡️'];
const VIBE_OPTIONS    = ['Casual & quick ⚡', 'Sit down & relax 😌', 'Date night 🌹', 'Family-friendly 👨‍👩‍👧', 'Solo, just me 🎧'];

function uid() { return Math.random().toString(36).slice(2, 9); }

function stars(rating?: number) {
  if (!rating) return '';
  return '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
}

function priceLabel(level?: number) {
  return ['', '$', '$$', '$$$', '$$$$'][level ?? 1] ?? '$';
}

// ── Photo Carousel ────────────────────────────────────────────────────────────
function PhotoCarousel({ photos }: { photos: { url: string }[] }) {
  const [idx, setIdx] = useState(0);
  if (!photos.length) return null;
  return (
    <div className="relative w-full h-48 rounded-2xl overflow-hidden bg-gray-900">
      <img src={photos[idx].url} alt="" className="w-full h-full object-cover" />
      {photos.length > 1 && (
        <>
          <button onClick={() => setIdx(i => (i - 1 + photos.length) % photos.length)}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg hover:bg-black/70 transition">‹</button>
          <button onClick={() => setIdx(i => (i + 1) % photos.length)}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg hover:bg-black/70 transition">›</button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {photos.map((_, i) => (
              <button key={i} onClick={() => setIdx(i)}
                className={`w-1.5 h-1.5 rounded-full transition ${i === idx ? 'bg-white' : 'bg-white/40'}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Result Card ───────────────────────────────────────────────────────────────
function ResultCard({ details, recommendation }: { details: PlaceDetails; recommendation: RecommendationResult }) {
  const topReview = details.reviews?.[0];
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination_place_id=${details.placeId}`;
  const orderUrl = details.website ?? `https://www.google.com/search?q=${encodeURIComponent(details.name + ' order online')}`;

  return (
    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-sm w-full mx-auto animate-slideUp">
      <PhotoCarousel photos={details.photos} />

      <div className="p-5 space-y-3">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-gray-900 font-bold text-xl leading-tight">{details.name}</h2>
            <span className="text-xs font-bold bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full whitespace-nowrap">
              {priceLabel(details.priceLevel)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-amber-400 text-sm">{stars(details.rating)}</span>
            <span className="text-gray-500 text-xs">{details.rating?.toFixed(1)} ({details.totalRatings?.toLocaleString()} reviews)</span>
          </div>
          <p className="text-gray-400 text-xs mt-0.5 truncate">{details.address}</p>
        </div>

        {/* Gemini pick reason */}
        <div className="bg-indigo-50 rounded-xl p-3">
          <p className="text-indigo-700 text-sm leading-relaxed">
            <span className="font-bold">✨ Why you'll love it: </span>
            {recommendation.reason}
          </p>
        </div>

        {/* What locals are saying */}
        {topReview && (
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">What locals are saying</p>
            <p className="text-gray-600 text-sm leading-relaxed italic">
              "{topReview.text.slice(0, 140)}{topReview.text.length > 140 ? '…' : ''}"
            </p>
            <p className="text-gray-400 text-xs mt-1.5">— {topReview.authorName} · {topReview.relativeTime}</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {details.phone && (
            <a href={`tel:${details.phone}`}
              className="flex flex-col items-center gap-1 bg-emerald-500 text-white rounded-xl py-2.5 px-1 text-xs font-bold hover:bg-emerald-600 transition">
              <span className="text-lg">📞</span>
              Call Now
            </a>
          )}
          <a href={orderUrl} target="_blank" rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 bg-orange-500 text-white rounded-xl py-2.5 px-1 text-xs font-bold hover:bg-orange-600 transition">
            <span className="text-lg">🛵</span>
            Order Now
          </a>
          <a href={directionsUrl} target="_blank" rel="noopener noreferrer"
            className="flex flex-col items-center gap-1 bg-blue-500 text-white rounded-xl py-2.5 px-1 text-xs font-bold hover:bg-blue-600 transition">
            <span className="text-lg">🗺️</span>
            Directions
          </a>
        </div>

        {/* Sign-off */}
        <p className="text-center text-gray-400 text-sm pt-1">
          Enjoy your meal! 🍽️
        </p>
      </div>
    </div>
  );
}

// ── Typewriter effect ─────────────────────────────────────────────────────────
function TypewriterText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone]           = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
        onDone?.();
      }
    }, 18);
    return () => clearInterval(id);
  }, [text, onDone]);

  return <span>{displayed}{!done && <span className="animate-pulse">▌</span>}</span>;
}

// ── Chat Bubble ───────────────────────────────────────────────────────────────
function BotBubble({ text, animate, onDone }: { text: string; animate?: boolean; onDone?: () => void }) {
  return (
    <div className="flex items-end gap-2 max-w-[85%]">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm flex-shrink-0 mb-1">🍽️</div>
      <div className="bg-white rounded-2xl rounded-bl-sm shadow-sm px-4 py-3 text-gray-800 text-sm leading-relaxed">
        {animate ? <TypewriterText text={text} onDone={onDone} /> : text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm max-w-[75%]">
        {text}
      </div>
    </div>
  );
}

// ── Quick Reply Chips ─────────────────────────────────────────────────────────
function QuickReplies({ options, onSelect }: { options: string[]; onSelect: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-2 ml-10">
      {options.map(opt => (
        <button key={opt} onClick={() => onSelect(opt)}
          className="bg-white border border-indigo-200 text-indigo-700 rounded-full px-3 py-1.5 text-sm font-medium hover:bg-indigo-50 hover:border-indigo-400 transition-all active:scale-95">
          {opt}
        </button>
      ))}
    </div>
  );
}

// ── Main Concierge ────────────────────────────────────────────────────────────
export default function ConciergePage() {
  const [messages, setMessages]         = useState<Message[]>([]);
  const [awaitingReply, setAwaiting]    = useState(false);
  const [step, setStep]                 = useState(0);
  const [answers, setAnswers]           = useState<Partial<ConciergeAnswers>>({});
  const [location, setLocation]         = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocError]    = useState('');
  const [loading, setLoading]           = useState(false);
  const [result, setResult]             = useState<{ recommendation: RecommendationResult; details: PlaceDetails } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addBot = useCallback((text: string, replies?: string[], animate = true) => {
    const msg: Message = { id: uid(), role: 'bot', text, replies };
    setMessages(prev => [...prev, msg]);
    setAwaiting(!!replies);
    return msg.id;
  }, []);

  const addUser = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: uid(), role: 'user', text }]);
    setAwaiting(false);
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, result]);

  // Start the flow
  useEffect(() => {
    setTimeout(() => {
      addBot("Hi! 👋 I'm your personal dining concierge. I'll find you the perfect spot nearby in just a few questions.", undefined, true);
    }, 400);
    setTimeout(() => {
      addBot('First — can I get your location so I know what\'s near you?', undefined, false);
      setStep(1);
    }, 2200);
  }, [addBot]);

  // Request geolocation
  useEffect(() => {
    if (step !== 1) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setTimeout(() => {
          const tod = getTimeOfDay();
          addBot(`Got it! 📍 What are you in the mood for ${tod === 'morning' ? 'this morning' : tod === 'lunch' ? 'for lunch' : tod === 'dinner' ? 'tonight' : 'tonight'}?`,
            MOOD_OPTIONS[tod]);
          setStep(2);
        }, 600);
      },
      () => {
        setLocError('Location access denied');
        addBot('No worries! Could you type your address or intersection so I can find places near you?');
        setStep(1.5);
      },
    );
  }, [step, addBot]);

  const handleReply = useCallback(async (value: string) => {
    addUser(value);
    const next = { ...answers };

    if (step === 2) {
      next.mood = value;
      setAnswers(next);
      // Ask travel mode
      setTimeout(() => {
        addBot('How are you getting there?', ['Walking 🚶', 'Driving 🚗', 'Delivery 🛵']);
        setStep(3);
      }, 400);

    } else if (step === 3) {
      const mode = value.toLowerCase().includes('walk') ? 'walk'
                 : value.toLowerCase().includes('driv') ? 'drive'
                 : 'delivery';
      next.travelMode = mode;
      setAnswers(next);

      setTimeout(() => {
        if (mode === 'walk') {
          addBot('How far are you walking tonight?', ['5 minutes 🚶', '10 minutes 🏃', '20 minutes 👟']);
        } else if (mode === 'drive') {
          addBot('How far are you willing to drive?', ['1 mile 🚗', '3 miles 🚗💨', '5 miles 🛣️']);
        } else {
          // Delivery — no distance question
          next.travelRange = '3';
          setAnswers(next);
          addBot('Staying in tonight — good call! 🛵 Any cuisine in particular?', CUISINE_OPTIONS);
          setStep(5);
          return;
        }
        setStep(4);
      }, 400);

    } else if (step === 4) {
      // Extract number from "10 minutes" or "3 miles"
      const num = value.match(/\d+/)?.[0] ?? '3';
      next.travelRange = num;
      setAnswers(next);
      setTimeout(() => {
        addBot('Any cuisine in particular?', CUISINE_OPTIONS);
        setStep(5);
      }, 400);

    } else if (step === 5) {
      next.cuisine = value.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
      setAnswers(next);
      setTimeout(() => {
        addBot('Anything to keep in mind?', DIETARY_OPTIONS);
        setStep(6);
      }, 400);

    } else if (step === 6) {
      next.dietary = value.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
      setAnswers(next);
      setTimeout(() => {
        addBot('Last one — what\'s the vibe tonight?', VIBE_OPTIONS);
        setStep(7);
      }, 400);

    } else if (step === 7) {
      next.vibe = value.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim();
      setAnswers(next);
      setStep(8);

      // Find restaurants
      setTimeout(async () => {
        addBot('Perfect! Let me find your ideal spot... 🔍');
        setLoading(true);

        try {
          const travelMode  = next.travelMode ?? 'walk';
          const travelRange = next.travelRange ?? '10';

          // Fetch nearby places
          const nearbyRes = await fetch('/api/concierge/nearby', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: location!.lat, lng: location!.lng,
              travelMode, travelRange,
              cuisine: next.cuisine !== 'Surprise me' ? next.cuisine : undefined,
            }),
          });
          const { places } = await nearbyRes.json();

          if (!places?.length) {
            addBot("Hmm, I couldn't find any matching restaurants right now. Try expanding your search radius or changing the cuisine!");
            setLoading(false);
            return;
          }

          // Get Gemini recommendation
          const recRes = await fetch('/api/concierge/recommend', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: next, candidates: places }),
          });
          const data = await recRes.json();

          setResult(data);
          addBot(`Found it! Here's your perfect match for tonight 🎯`);
        } catch {
          addBot('Oops — something went wrong. Please try again!');
        } finally {
          setLoading(false);
        }
      }, 500);
    }
  }, [step, answers, location, addBot, addUser]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg">🍽️</div>
        <div>
          <div className="font-bold text-gray-900 text-sm">AgenticLife Concierge</div>
          <div className="text-gray-400 text-xs flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
            Online now
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {messages.map((msg, i) => (
          <div key={msg.id} className="animate-slideUp">
            {msg.role === 'bot' ? (
              <>
                <BotBubble
                  text={msg.text}
                  animate={i === messages.length - 1 && msg.role === 'bot'}
                  onDone={() => {}}
                />
                {msg.replies && awaitingReply && i === messages.length - 1 && (
                  <QuickReplies options={msg.replies} onSelect={handleReply} />
                )}
              </>
            ) : (
              <UserBubble text={msg.text} />
            )}
          </div>
        ))}

        {/* Loading dots */}
        {loading && (
          <div className="flex items-end gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm flex-shrink-0">🍽️</div>
            <div className="bg-white rounded-2xl rounded-bl-sm shadow-sm px-4 py-3 flex gap-1 items-center">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-indigo-300 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* Result card */}
        {result && (
          <div className="mt-4 animate-slideUp">
            <ResultCard details={result.details} recommendation={result.recommendation} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
