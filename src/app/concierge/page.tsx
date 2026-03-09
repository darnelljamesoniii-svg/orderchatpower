'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  Lock, Search, TrendingUp, MapPin, ShieldCheck, 
  Zap, Clock, ChevronDown, ChevronUp, Users, Star
} from 'lucide-react';

// --- Structural Configuration (Safe for Build/Prerender) ---
const getSafeEnv = () => {
  if (typeof window === 'undefined') return { config: null, appId: 'build', token: null };
  return {
    config: typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null,
    appId: (typeof __app_id !== 'undefined' ? __app_id : 'demo').replace(/\//g, '_'),
    token: typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null
  };
};

// --- Utility Helpers ---
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0');
const currency = (n) => `$${fmt(n)}`;
const stars = (r) => {
  const count = typeof r === 'number' ? Math.min(5, Math.max(0, Math.round(r))) : 0;
  return '★'.repeat(count) + '☆'.repeat(5 - count);
};

// --- Concierge Logic ---
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

// --- Visual Components ---

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
  if (!photos || !photos.length) return <div className="w-full h-44 bg-gray-800/50 rounded-2xl animate-pulse" />;
  return (
    <div className="relative w-full h-44 rounded-2xl overflow-hidden shadow-2xl border border-white/5">
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
    <div className="border rounded-2xl overflow-hidden transition-all" style={{ borderColor: color + '30' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-4 text-left hover:brightness-110 transition-all" style={{ background: color + '05' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="font-bold text-white text-xs uppercase tracking-wider">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-xs" style={{ color }}>{count || 0} local spots</span>
          {open ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-700" />}
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-800 bg-gray-900/40 max-h-64 overflow-y-auto custom-scrollbar">
          {!items || items.length === 0 ? (
            <div className="px-4 py-4 text-gray-500 text-[10px] italic uppercase tracking-widest">Scanning network...</div>
          ) : (
            items.map(c => (
              <div key={c.placeId || Math.random()} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                <div>
                  <div className="text-white text-xs font-semibold">{c.name}</div>
                  <div className="text-gray-500 text-[9px] uppercase tracking-widest">{c.category}</div>
                </div>
                <div className="text-right text-[9px] text-gray-400">
                  <div className="text-amber-400 font-bold mb-0.5">{stars(c.rating)}</div>
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

const ConciergeDemo = ({ business }) => {
  const [messages, setMessages] = useState([]);
  const [step, setStep] = useState(0);
  const bottomRef = useRef(null);

  const addBot = useCallback((text, replies) => {
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'bot', text, replies }]);
  }, []);

  const addUser = (text) => {
    setMessages(prev => [...prev, { id: Math.random().toString(), role: 'user', text }]);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (step === 0 && business?.address) {
      setTimeout(() => addBot(`Hi! 👋 I'm the AI concierge for this area.`), 400);
      setTimeout(() => addBot(`I've automatically pre-loaded your location at ${business.address.split(',')[0]} 📍`), 1600);
      setTimeout(() => {
        const tod = getTimeOfDay();
        addBot(`What are you in the mood for ${tod === 'dinner' ? 'tonight' : 'today'}?`, MOOD_OPTIONS[tod]);
        setStep(1);
      }, 2800);
    }
  }, [step, business?.address, addBot]);

  const handleReply = (opt) => {
    addUser(opt);
    setTimeout(() => addBot(`Looking for the best ${opt.split(' ')[0]} options in this area... 🔍`), 600);
    setTimeout(() => addBot(`Found it! Based on live sentiment data, the top recommendation right now is actually one of your competitors.`), 2400);
    setTimeout(() => addBot(`In the full version, we'd intercept this customer and route them directly to YOU instead. 🎯`), 4200);
  };

  return (
    <div className="bg-white rounded-[32px] h-[480px] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs">🍽️</div>
          <div>
            <div className="text-[10px] font-black text-gray-900 uppercase tracking-tighter leading-none">Local AI Concierge</div>
            <div className="text-[8px] text-emerald-500 font-bold flex items-center gap-1 mt-0.5"><span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" /> LIVE RADIUS SCAN</div>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed font-medium ${
              m.role === 'user' ? 'bg-indigo-600 text-white rounded-br-sm shadow-md' : 'bg-gray-100 text-gray-800 rounded-bl-sm border border-gray-200 shadow-sm'
            }`}>
              {m.text}
              {m.replies && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.replies.map(r => (
                    <button key={r} onClick={() => handleReply(r)} className="bg-white border border-indigo-200 text-indigo-600 px-2 py-1 rounded-lg font-bold text-[10px] hover:bg-indigo-50 transition-all shadow-sm">{r}</button>
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

const TICKET_OPTIONS = [
  { label: 'Fast Casual', range: '$12–18', value: 15 },
  { label: 'Casual Dining', range: '$22–35', value: 28 },
  { label: 'Polished Casual', range: '$35–55', value: 45 },
  { label: 'Fine Dining', range: '$65+', value: 75 },
];

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

  // 1. Structural Fixes (Client-side init only)
  const env = useMemo(() => getSafeEnv(), []);
  
  const services = useMemo(() => {
    if (!env.config) return null;
    const appInstance = getApps().length > 0 ? getApp() : initializeApp(env.config);
    return {
      db: getFirestore(appInstance),
      auth: getAuth(appInstance),
      appId: env.appId
    };
  }, [env]);

  // 2. Immediate Data Injection (URL First)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setParams(p);
    
    // INJECT DATA IMMEDIATELY
    const name = p.get('name') || 'Z Co-Space & Kava Clubhouse';
    const address = p.get('address') || '1413 Haven Dr, Orlando, FL 32803';
    setBusiness({ name, address, photos: [] });
  }, []);

  // 3. Auth Handshake
  useEffect(() => {
    if (services?.auth) {
      const init = async () => {
        try {
          if (env.token) await signInWithCustomToken(services.auth, env.token);
          else await signInAnonymously(services.auth);
        } catch (e) {}
      };
      init();
      return onAuthStateChanged(services.auth, setUser);
    }
  }, [services, env.token]);

  // 4. Competitor Fetch (Dynamic Category)
  useEffect(() => {
    const placeId = params?.get('place_id');
    if (!placeId) return;

    const pull = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/competition?place_id=${encodeURIComponent(placeId)}&category=${encodeURIComponent(category)}`);
        const data = await res.json();
        const bData = data.business || data.lead;
        if (bData) {
          setBusiness(prev => ({ ...prev, ...bData }));
          setCompetitors(data.competitors || { tier1: [], tier2: [], tier3: [] });
          setCounts(data.counts || { tier1: 0, tier2: 0, tier3: 0 });
        }
      } catch (e) {} finally {
        setLoading(false);
      }
    };
    pull();
  }, [params, category]);

  // 5. Pricing ROI
  useEffect(() => {
    if (!counts?.tier1) return;
    fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competitorCounts: { tier1: counts.tier1, tier2: counts.tier2 - counts.tier1, tier3: counts.tier3 - counts.tier2 },
        avgTicket,
      }),
    })
      .then(r => r.json())
      .then(d => setPricings(d.pricings))
      .catch(() => {});
  }, [counts, avgTicket]);

  // 6. Real-time Mirror Sync
  useEffect(() => {
    if (!user || !services || !params) return;
    const sessionId = params.get('sessionId') || 'prospect-demo';
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

  const isMirror = params?.get('mirror') === 'true';

  return (
    <div className="min-h-screen bg-[#060810] text-gray-100 font-sans pb-40">
      <header className="bg-gray-900/80 border-b border-white/5 px-6 py-5 sticky top-0 z-50 backdrop-blur-xl flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-indigo-500 fill-indigo-500" />
          <span className="font-black tracking-tighter text-xl uppercase italic">Agentic<span className="text-indigo-500">Life</span></span>
        </div>
        <div className="flex items-center gap-4">
          {isMirror && <div className="bg-red-600 text-[9px] font-black px-3 py-1.5 rounded-full animate-pulse flex items-center gap-2 shadow-lg shadow-red-900/40"><ActivityPulse /> PROSPECT MIRROR</div>}
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2"><Clock className="w-3 h-3 text-indigo-500" /> Secure Portal Active</div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
        <div className="flex flex-col lg:flex-row gap-12">
          
          {/* LEFT: Context */}
          <div className="w-full lg:w-[440px] space-y-12 flex-shrink-0">
            <div className="space-y-4">
               <div className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[9px] font-black uppercase tracking-widest">Live Territory Scan</div>
               <h2 className="text-4xl font-black text-white italic tracking-tighter leading-none">{business?.name}</h2>
               <p className="text-gray-500 text-xs font-bold leading-relaxed">{business?.address}</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-700">Neighborhood Concierge</h3>
              <ConciergeDemo business={business} />
              <p className="text-[10px] text-gray-600 italic text-center leading-relaxed px-6">
                "Our AI redirects local decision-makers from competitors back to you in real-time."
              </p>
            </div>

            <div className="bg-gray-900/40 border border-white/5 rounded-[40px] p-8 shadow-2xl backdrop-blur-md">
               <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 mb-8">Refine Search Ring</h3>
               <div className="grid grid-cols-2 gap-3">
                  {['Restaurant', 'Pizza', 'Kava', 'Cafe', 'Bar', 'Gym'].map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)} className={`py-4 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${category === cat ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-900/60' : 'bg-white/5 border-white/5 text-gray-500 hover:border-gray-500'}`}>{cat}</button>
                  ))}
               </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-700">Proximity Vulnerability</h3>
              <CompetitorList title="Tier 1 — Hyper-Local" count={counts.tier1} items={competitors.tier1} color="#38bdf8" />
              <CompetitorList title="Tier 2 — High Drive" count={counts.tier2} items={competitors.tier2} color="#818cf8" />
              <CompetitorList title="Tier 3 — City Dominance" count={counts.tier3} items={competitors.tier3} color="#fbbf24" />
            </div>
          </div>

          {/* RIGHT: ROI */}
          <div className="flex-1 space-y-12">
            <div className="space-y-10">
              <div className="bg-gradient-to-r from-gray-900 to-transparent p-8 rounded-[40px] border-l-4 border-indigo-500">
                <h3 className="text-5xl font-black text-white italic tracking-tighter mb-6">ROI Projection</h3>
                <p className="text-gray-400 text-base leading-relaxed max-w-xl">
                  By locking your category, you become the exclusive recommendation in these rings. We've mapped {counts.tier3} local threats to calculate your dominance score.
                </p>
              </div>

              <div className="bg-gray-900/30 border border-white/5 p-10 rounded-[48px] space-y-12">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500">Ticket Size Input</h4>
                  <div className="flex flex-wrap gap-2">
                    {TICKET_OPTIONS.map(t => (
                      <button key={t.value} onClick={() => setAvgTicket(t.value)} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase border transition-all ${avgTicket === t.value ? 'bg-indigo-600 border-indigo-500 text-white shadow-xl shadow-indigo-900/40' : 'bg-black/40 border-white/5 text-gray-600 hover:border-gray-500'}`}>{t.label}</button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {pricings ? pricings.map(tp => (
                    <div key={tp.tier.id} className="bg-black/40 border border-white/5 rounded-[40px] p-8 flex flex-col hover:border-indigo-500/30 transition-all group relative overflow-hidden">
                       <div className="mb-10">
                          <h5 className="text-white font-black italic tracking-tighter uppercase text-xl mb-1">{tp.tier.name}</h5>
                          <p className="text-indigo-500 text-[10px] font-black uppercase tracking-[0.2em]">{tp.tier.tagline}</p>
                       </div>
                       
                       <div className="space-y-4 mb-10">
                         <div className="flex justify-between items-end border-b border-white/5 pb-4">
                           <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">ROI Multiple</span>
                           <span className="text-2xl font-black text-white tracking-tighter">{tp.roi.roiMultiple}×</span>
                         </div>
                         <div className="flex justify-between items-end">
                           <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Yearly Rev</span>
                           <span className="text-2xl font-black text-emerald-400 tracking-tighter">{currency(tp.roi.newRevenuePerYear)}</span>
                         </div>
                       </div>

                       <div className="mt-auto space-y-6">
                          <div className="text-center">
                             <div className="text-3xl font-black text-white tracking-tighter">{currency(tp.annualPrice)}</div>
                             <div className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mt-1">One-time Yearly Lock</div>
                          </div>
                          <button className="w-full py-5 rounded-[20px] bg-white text-black font-black text-[11px] uppercase tracking-[0.3em] transition-all hover:bg-indigo-500 hover:text-white shadow-2xl">🔒 Lock Zone</button>
                       </div>
                    </div>
                  )) : (
                    [1,2,3].map(i => <div key={i} className="h-96 bg-white/5 rounded-[40px] animate-pulse" />)
                  )}
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-10">
               {[
                 { icon: ShieldCheck, title: 'Category Monopoly', desc: 'Once locked, your category is closed to others for 12 months in this zone.' },
                 { icon: Zap, title: 'Real-time Intercept', desc: 'Directly capturing peak intent searches and routing them to your business.' },
                 { icon: Users, title: 'Network Propagation', desc: 'Your business becomes the standard recommendation across our concierge ring.' },
                 { icon: TrendingUp, title: 'Market Share Capture', desc: 'Analyzed competitor data shows immediate volume shift upon activation.' }
               ].map(item => (
                 <div key={item.title} className="flex gap-6 p-8 rounded-[32px] bg-white/5 border border-white/5">
                   <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0 border border-indigo-500/10"><item.icon className="w-7 h-7 text-indigo-400" /></div>
                   <div>
                     <h4 className="text-white font-black text-sm mb-2 uppercase italic tracking-tight">{item.title}</h4>
                     <p className="text-gray-500 text-xs leading-relaxed font-medium">{item.desc}</p>
                   </div>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes loading { from { transform: translateX(-100%); } to { transform: translateX(100%); } }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #312e81; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
