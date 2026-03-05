'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  Lock, Search, TrendingUp, MapPin, ShieldCheck, 
  Zap, Clock, ChevronDown, ChevronUp, Users, Star
} from 'lucide-react';

// --- Types for Concierge ---
interface Message {
  id: string;
  role: 'bot' | 'user';
  text: string;
  replies?: string[];
}

// --- Firebase Configuration & Prerender Safety ---
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined') {
    try { return JSON.parse(__firebase_config); } catch (e) { return null; }
  }
  return null;
};

const getAppId = () => {
  const rawId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  return rawId.replace(/\//g, '_');
};

const initFirebase = () => {
  const config = getFirebaseConfig();
  if (!config) return { db: null, auth: null, appId: getAppId() };
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  return { db: getFirestore(app), auth: getAuth(app), appId: getAppId() };
};

const { db, auth, appId } = initFirebase();

// --- Utility Helpers ---
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0');
const currency = (n) => `$${fmt(n)}`;
const stars = (r) => {
  const count = typeof r === 'number' ? Math.min(5, Math.max(0, Math.round(r))) : 0;
  return '★'.repeat(count) + '☆'.repeat(5 - count);
};

// --- Concierge Helpers ---
const MOOD_OPTIONS = {
  morning: ['Coffee & Breakfast ☕', 'Brunch 🥂', 'Bakery 🥐', 'Quick Bite 🥪'],
  lunch:   ['Quick Bite 🥪', 'Sit Down & Relax 🍽️', 'Something Light 🥗', 'Comfort Food 🍔'],
  dinner:  ['Comfort Food 🍔', 'Something Special ✨', 'Quick & Easy ⚡', 'Date Night 🌹'],
  late:    ['Late Night 🌙', 'Bar Food 🍻', 'Delivery 🛵', 'Quick Bite 🥪'],
};

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 11) return 'morning';
  if (h < 14) return 'lunch';
  if (h < 21) return 'dinner';
  return 'late';
}

// --- Sub-Components ---

const ActivityPulse = () => (
  <span className="relative flex h-2 w-2">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
  </span>
);

const PhotoCarousel = ({ photos }) => {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!photos || photos.length < 2) return;
    const id = setInterval(() => setIdx(i => (i + 1) % photos.length), 3500);
    return () => clearInterval(id);
  }, [photos]);
  if (!photos || !photos.length) return <div className="w-full h-44 bg-gray-800 rounded-2xl animate-pulse" />;
  return (
    <div className="relative w-full h-44 rounded-2xl overflow-hidden shadow-2xl">
      {photos.map((p, i) => (
        <img key={i} src={p.url} alt="" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === idx ? 'opacity-100' : 'opacity-0'}`} />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
    </div>
  );
};

const CompetitorList = ({ title, count, items, color }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-2xl overflow-hidden transition-all" style={{ borderColor: color + '40' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-4 text-left hover:brightness-110 transition-all" style={{ background: color + '10' }}>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ background: color }} />
          <span className="font-bold text-white text-sm tracking-tight">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-sm" style={{ color }}>{count || 0} competitors</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-700" />}
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-800 bg-gray-900/40 max-h-64 overflow-y-auto">
          {!items || items.length === 0 ? (
            <div className="px-4 py-4 text-gray-500 text-xs italic">No competitors identified in this ring.</div>
          ) : (
            items.map(c => (
              <div key={c.placeId || Math.random()} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                <div>
                  <div className="text-white text-sm font-semibold">{c.name}</div>
                  <div className="text-gray-500 text-[10px] uppercase tracking-wider">{c.category}</div>
                </div>
                <div className="text-right text-[10px] text-gray-400">
                  <div className="text-amber-400 font-bold mb-0.5">{stars(c.rating)} {c.rating?.toFixed(1)}</div>
                  {c.distanceMetres ? `${(c.distanceMetres / 1609.34).toFixed(1)}mi` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// --- Concierge Demo Component ---
const ConciergeDemo = ({ business }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addBot = useCallback((text: string, replies?: string[]) => {
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'bot', text, replies }]);
  }, []);

  const addUser = (text: string) => {
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', text }]);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (step === 0 && business) {
      setTimeout(() => {
        addBot(`Hi! 👋 I'm the dining concierge for this neighborhood.`);
      }, 500);
      setTimeout(() => {
        addBot(`I've pre-loaded your location at ${business.address.split(',')[0]} 📍`);
      }, 1800);
      setTimeout(() => {
        const tod = getTimeOfDay();
        addBot(`What are you in the mood for ${tod === 'dinner' ? 'tonight' : 'today'}?`, MOOD_OPTIONS[tod]);
        setStep(1);
      }, 3000);
    }
  }, [step, business, addBot]);

  const handleReply = (opt: string) => {
    addUser(opt);
    setTimeout(() => {
      addBot(`Perfect choice. I'm searching for the highest rated ${opt.split(' ')[0]} spots within walking distance... 🔍`);
    }, 600);
    setTimeout(() => {
      addBot(`Found it! Based on live local data, the top recommendation for this area is actually one of your competitors.`);
    }, 2500);
    setTimeout(() => {
      addBot(`(In the full version, we'd route this customer directly to YOU instead) 🎯`);
    }, 4500);
  };

  return (
    <div className="bg-white rounded-[32px] h-[500px] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
      <div className="p-4 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
        <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs">🍽️</div>
        <div>
          <div className="text-[11px] font-black text-gray-900 uppercase tracking-tighter">Local Concierge</div>
          <div className="text-[9px] text-emerald-500 font-bold flex items-center gap-1"><span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" /> Live in your zone</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
              m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
            }`}>
              {m.text}
              {m.replies && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.replies.map(r => (
                    <button key={r} onClick={() => handleReply(r)} className="bg-white border border-indigo-200 text-indigo-600 px-2 py-1 rounded-lg font-bold hover:bg-indigo-50 transition-all">{r}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};

// --- Pricing & ROI Helpers ---
const TICKET_OPTIONS = [
  { label: 'Fast Casual', range: '$12–18', value: 15 },
  { label: 'Casual Dining', range: '$22–35', value: 28 },
  { label: 'Polished Casual', range: '$35–55', value: 45 },
  { label: 'Fine Dining', range: '$65+', value: 75 },
];

const ROIBadge = ({ roi }) => (
  <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
    <div className="flex items-center gap-2">
      <TrendingUp className="w-4 h-4 text-emerald-400" />
      <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-[0.2em]">ROI Projection</span>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <div className="text-white font-black text-2xl tracking-tighter">{roi?.roiMultiple || 0}×</div>
        <div className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Annual Return</div>
      </div>
      <div>
        <div className="text-white font-black text-2xl tracking-tighter">{currency(roi?.newRevenuePerYear || 0)}</div>
        <div className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">New Rev/Yr</div>
      </div>
    </div>
  </div>
);

// --- MAIN APPLICATION ---

const App = () => {
  const [params, setParams] = useState(null);
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [competitors, setCompetitors] = useState({ tier1: [], tier2: [], tier3: [] });
  const [counts, setCounts] = useState({ tier1: 0, tier2: 0, tier3: 0 });
  const [pricings, setPricings] = useState(null);
  const [category, setCategory] = useState('Restaurant');
  const [avgTicket, setAvgTicket] = useState(28);
  const [loading, setLoading] = useState(true);
  const [lockSuccess, setLockSuccess] = useState(false);
  const scrollRef = useRef(0);

  // 1. Firebase Memo
  const services = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return initFirebase();
  }, []);

  // 2. Initial Config
  useEffect(() => {
    if (typeof window !== 'undefined') setParams(new URLSearchParams(window.location.search));
    if (services?.auth) {
      const initAuth = async () => {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(services.auth, __initial_auth_token);
        } else {
          await signInAnonymously(services.auth);
        }
      };
      initAuth();
      return onAuthStateChanged(services.auth, setUser);
    }
  }, [services]);

  // 3. Fetch Lead & Competition
  useEffect(() => {
    const placeId = params?.get('place_id');
    if (!placeId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/competition?place_id=${encodeURIComponent(placeId)}&category=${encodeURIComponent(category)}`);
        const data = await res.json();
        const bData = data.business || data.lead;
        if (bData) {
          setBusiness(bData);
          setCompetitors(data.competitors || { tier1: [], tier2: [], tier3: [] });
          setCounts(data.counts || { tier1: 0, tier2: 0, tier3: 0 });
        }
      } catch (e) {
        console.error("Fetch fail:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [params, category]);

  // 4. ROI Sync
  useEffect(() => {
    if (!counts?.tier1) return;
    fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competitorCounts: { tier1: counts.tier1, tier2: (counts.tier2 || 0) - (counts.tier1 || 0), tier3: (counts.tier3 || 0) - (counts.tier2 || 0) },
        avgTicket,
      }),
    })
      .then(r => r.json())
      .then(d => setPricings(d.pricings))
      .catch(() => {});
  }, [counts, avgTicket]);

  // 5. Live Mirror Logic
  useEffect(() => {
    if (!user || !services || !params) return;
    const sessionId = params.get('sessionId') || 'demo-session';
    const isMirror = params.get('mirror') === 'true';
    const stateDoc = doc(services.db, 'artifacts', services.appId, 'public', 'data', 'sync_states', sessionId);
    
    const unsub = onSnapshot(stateDoc, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.category && data.category !== category) setCategory(data.category);
        if (data.avgTicket && data.avgTicket !== avgTicket) setAvgTicket(data.avgTicket);
        if (isMirror && typeof data.scrollPos === 'number') {
          window.scrollTo({ top: data.scrollPos, behavior: 'smooth' });
        }
        if (data.lockSuccess) setLockSuccess(true);
      }
    });

    const handleScroll = () => {
      if (isMirror) return;
      const pos = window.scrollY;
      if (Math.abs(pos - scrollRef.current) > 100) {
        scrollRef.current = pos;
        updateDoc(stateDoc, { scrollPos: pos }).catch(() => setDoc(stateDoc, { scrollPos: pos, category, avgTicket }, { merge: true }));
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => { unsub(); window.removeEventListener('scroll', handleScroll); };
  }, [user, services, params, category, avgTicket]);

  if (loading && !business) {
    return (
      <div className="min-h-screen bg-[#060810] flex flex-col items-center justify-center">
        <Zap className="w-12 h-12 text-indigo-500 animate-pulse mb-4" />
        <div className="w-48 h-1 bg-gray-900 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-500 animate-[loading_2s_infinite]" />
        </div>
      </div>
    );
  }

  const isMirror = params?.get('mirror') === 'true';

  return (
    <div className="min-h-screen bg-[#060810] text-gray-100 font-sans pb-32">
      <header className="bg-gray-900/80 border-b border-gray-800 px-6 py-5 sticky top-0 z-50 backdrop-blur-xl flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-indigo-500 fill-indigo-500" />
          <span className="font-black tracking-tighter text-xl uppercase italic">Agentic<span className="text-indigo-500">Life</span></span>
        </div>
        <div className="flex items-center gap-4">
          {isMirror && <div className="bg-red-600 text-[9px] font-black px-3 py-1 rounded-full animate-pulse flex items-center gap-2 shadow-lg shadow-red-900/40"><ActivityPulse /> PROSPECT MIRROR</div>}
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2"><Clock className="w-3 h-3" /> Secure Session Active</div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* LEFT: Context Column */}
          <div className="w-full lg:w-[420px] space-y-10 flex-shrink-0">
            <div className="space-y-4">
               <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase tracking-widest">Exclusive Territory Scan</div>
               <h2 className="text-4xl font-black text-white italic tracking-tighter leading-none">{business?.name || business?.businessName}</h2>
               <p className="text-gray-500 text-xs font-bold leading-relaxed">{business?.address}</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-600">The Customer Experience</h3>
              <ConciergeDemo business={business} />
              <p className="text-[10px] text-gray-500 italic text-center leading-relaxed px-4">
                "When a customer asks for a recommendation at this address, our network either routes them to a competitor, or directly to you."
              </p>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-[32px] p-6">
               <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-6">Refine Industry Filter</h3>
               <div className="grid grid-cols-2 gap-2">
                  {['Restaurant', 'Pizza', 'Sushi', 'Cafe', 'Bar', 'Bakery'].map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)} className={`py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${category === cat ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-900/40' : 'bg-gray-800/40 border-gray-700 text-gray-500 hover:border-gray-500'}`}>{cat}</button>
                  ))}
               </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-600">Proximity Threats</h3>
              <CompetitorList title="Zone 1 — Walk Score" count={counts.tier1} items={competitors.tier1} color="#38bdf8" />
              <CompetitorList title="Zone 2 — Drive Score" count={counts.tier2} items={competitors.tier2} color="#818cf8" />
              <CompetitorList title="Zone 3 — Market Share" count={counts.tier3} items={competitors.tier3} color="#fbbf24" />
            </div>
          </div>

          {/* RIGHT: ROI & Action Column */}
          <div className="flex-1 space-y-12">
            <div className="space-y-8">
              <div>
                <h3 className="text-4xl font-black text-white italic tracking-tighter mb-4">Dominance Projection</h3>
                <p className="text-gray-400 text-sm leading-relaxed max-w-xl">
                  By locking your category, you become the exclusive recommendation in these rings. We've analyzed {counts.tier3} nearby competitors to project your break-even point.
                </p>
              </div>

              <div className="bg-gray-900/30 border border-gray-800 p-8 rounded-[40px] space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Average Ticket Size</h4>
                  <div className="flex flex-wrap gap-2">
                    {TICKET_OPTIONS.map(t => (
                      <button key={t.value} onClick={() => setAvgTicket(t.value)} className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase border transition-all ${avgTicket === t.value ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/40' : 'bg-[#060810] border-gray-800 text-gray-600 hover:border-gray-600'}`}>{t.label}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {pricings ? pricings.map(tp => (
                    <div key={tp.tier.id} className="bg-[#060810] border border-gray-800 rounded-3xl p-6 flex flex-col hover:border-gray-700 transition-all group">
                       <div className="mb-6">
                          <h5 className="text-white font-black italic tracking-tighter uppercase text-lg">{tp.tier.name}</h5>
                          <p className="text-gray-600 text-[9px] font-black uppercase tracking-widest">{tp.tier.tagline}</p>
                       </div>
                       <ROIBadge roi={tp.roi} />
                       <div className="mt-8 space-y-4">
                          <div className="flex items-end justify-between">
                             <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Annual Price</span>
                             <span className="text-2xl font-black text-white tracking-tighter">{currency(tp.annualPrice)}</span>
                          </div>
                          <button className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-[0.2em] transition-all shadow-lg shadow-indigo-900/20">🔒 Lock Zone</button>
                       </div>
                    </div>
                  )) : (
                    [1,2,3].map(i => <div key={i} className="h-64 bg-gray-900/50 rounded-3xl animate-pulse" />)
                  )}
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-900/50 to-indigo-950/20 border border-gray-800 rounded-[32px] p-8">
               <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 mb-8">Competitive Advantage</h3>
               <div className="grid md:grid-cols-2 gap-10">
                  {[
                    { icon: ShieldCheck, title: 'Total Exclusivity', desc: 'Category lock is strictly limited to one business per zone for 12 months.' },
                    { icon: Zap, title: 'Peak Intent Intercept', desc: 'Directly capturing customers at the exact moment of decision making.' },
                    { icon: Users, title: 'Viral Distribution', desc: 'Your recommendation propagates across the entire Agentic Concierge network.' },
                    { icon: TrendingUp, title: 'Fixed ROI Protection', desc: 'Stop bidding against competitors. One zone, one price, guaranteed reach.' }
                  ].map(item => (
                    <div key={item.title} className="flex gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0"><item.icon className="w-6 h-6 text-indigo-400" /></div>
                      <div>
                        <h4 className="text-white font-bold text-sm mb-1 italic uppercase tracking-tight">{item.title}</h4>
                        <p className="text-gray-500 text-xs leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes loading { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
