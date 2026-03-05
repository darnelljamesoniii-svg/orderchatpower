'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  Lock, Search, TrendingUp, MapPin, ShieldCheck, 
  Zap, Clock, ChevronDown, ChevronUp, Users
} from 'lucide-react';

// --- Utility Helpers ---
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0');
const currency = (n) => `$${fmt(n)}`;
const stars = (r) => {
  const count = typeof r === 'number' ? Math.min(5, Math.max(0, Math.round(r))) : 0;
  return '★'.repeat(count) + '☆'.repeat(5 - count);
};

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
        <div className="divide-y divide-gray-800 bg-gray-900/40">
          {!items || items.length === 0 ? (
            <div className="px-4 py-4 text-gray-500 text-xs italic">No competitors identified in this ring.</div>
          ) : (
            items.map(c => (
              <div key={c.placeId || Math.random()} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
                <div>
                  <div className="text-white text-sm font-semibold">{c.name}</div>
                  <div className="text-gray-500 text-[10px] uppercase tracking-wider">{c.category}</div>
                </div>
                <div className="text-right">
                  <div className="text-amber-400 text-xs font-bold mb-0.5">{stars(c.rating)} {c.rating?.toFixed(1)}</div>
                  <div className="text-gray-600 text-[10px]">{c.distanceMetres ? `${(c.distanceMetres / 1609.34).toFixed(1)}mi away` : ''}</div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

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

const TierCard = ({ tp, onLock }) => {
  const [payOpt, setPayOpt] = useState('full');
  const opt = tp.paymentOptions.find(o => o.id === payOpt);
  const color = tp.tier.color || '#4f46e5';
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden flex flex-col transition-all hover:border-gray-700 shadow-2xl group">
      <div className="px-6 py-5 border-b border-gray-800" style={{ background: `linear-gradient(135deg, ${color}15, transparent)` }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-white text-lg tracking-tight uppercase italic">{tp.tier.name}</h3>
            <p className="text-gray-500 text-[10px] uppercase font-bold tracking-widest">{tp.tier.tagline}</p>
          </div>
          <div className="text-right">
            <div className="font-black text-2xl text-white tracking-tighter">{currency(tp.annualPrice)}</div>
            <div className="text-gray-500 text-[10px] font-bold uppercase">{currency(tp.monthlyEquiv)}/mo</div>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6 flex-1 flex flex-col">
        <ROIBadge roi={tp.roi} />
        <div className="space-y-2">
          {tp.paymentOptions.map(o => (
            <button key={o.id} onClick={() => setPayOpt(o.id)} className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${payOpt === o.id ? 'border-white/20 bg-white/5 ring-1 ring-white/10' : 'border-gray-800 text-gray-500 hover:border-gray-700'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest">{o.label}</span>
              </div>
              <div className="font-black text-white text-sm">{o.id === 'full' ? `${currency(o.annualTotal)} Full Lock` : `${currency(o.monthly)}/mo`}</div>
            </button>
          ))}
        </div>
        <button onClick={() => onLock(tp)} className="w-full py-4 rounded-2xl font-black text-xs tracking-[0.2em] uppercase transition-all mt-auto shadow-lg" style={{ background: color, color: '#000' }}>🔒 Lock Zone Now</button>
      </div>
    </div>
  );
};

const StingAnimation = ({ competitor, business, stingMessage, onDone }) => {
  const [phase, setPhase] = useState('search');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('spinning'), 1200);
    const t2 = setTimeout(() => setPhase('result'), 3000);
    const t3 = setTimeout(() => setPhase('message'), 4200);
    const t4 = setTimeout(() => onDone(), 7000);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, [onDone]);
  return (
    <div className="bg-gray-900 border border-indigo-500/30 rounded-3xl p-6 space-y-5 shadow-[0_0_50px_rgba(79,70,229,0.1)] relative overflow-hidden">
      <div className="bg-white rounded-2xl px-5 py-4 flex items-center gap-3 shadow-xl">
        <Search className="w-5 h-5 text-gray-400" />
        <span className="text-gray-900 font-bold text-sm tracking-tight italic">best {competitor?.category || 'places'} near me</span>
      </div>
      {(phase === 'result' || phase === 'message') && (
        <div className="bg-white rounded-3xl p-5 shadow-2xl transform animate-scaleUp">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-3xl shadow-inner shadow-indigo-200">📍</div>
            <div className="flex-1">
              <div className="font-black text-gray-900 text-base leading-tight">{competitor?.name || 'Local Rival'}</div>
              <div className="text-amber-500 text-xs font-black">{stars(competitor?.rating)} {competitor?.rating?.toFixed(1) || '4.8'}</div>
            </div>
            <div className="bg-indigo-600 text-white text-[10px] font-black px-4 py-2 rounded-full shadow-lg">WINNER</div>
          </div>
        </div>
      )}
      {phase === 'message' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 animate-slideUp">
          <p className="text-red-300 text-xs leading-relaxed italic font-medium">"{stingMessage}"</p>
        </div>
      )}
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
  // 1. STATE & HOOKS
  const [params, setParams] = useState(null);
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [competitors, setCompetitors] = useState({ tier1: [], tier2: [], tier3: [] });
  const [counts, setCounts] = useState({ tier1: 0, tier2: 0, tier3: 0 });
  const [pricings, setPricings] = useState(null);
  const [category, setCategory] = useState('Restaurant');
  const [avgTicket, setAvgTicket] = useState(28);
  const [loading, setLoading] = useState(true);
  const [stingDone, setStingDone] = useState(false);
  const [lockSuccess, setLockSuccess] = useState(false);
  const scrollRef = useRef(0);

  // 2. FIREBASE INSTANCE (Memoized to prevent build errors)
  const services = useMemo(() => {
    if (typeof window === 'undefined' || typeof __firebase_config === 'undefined') return null;
    try {
      const config = JSON.parse(__firebase_config);
      const app = getApps().length > 0 ? getApp() : initializeApp(config);
      const rawId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      return {
        db: getFirestore(app),
        auth: getAuth(app),
        appId: rawId.replace(/\//g, '_')
      };
    } catch (e) {
      return null;
    }
  }, []);

  // 3. INITIALIZATION
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setParams(new URLSearchParams(window.location.search));
    }
    if (services?.auth) {
      const initAuth = async () => {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(services.auth, __initial_auth_token);
        } else {
          await signInAnonymously(services.auth);
        }
      };
      initAuth();
      const unsub = onAuthStateChanged(services.auth, setUser);
      return () => unsub();
    }
  }, [services]);

  // 4. DATA FETCHING
  useEffect(() => {
    const placeId = params?.get('place_id');
    if (!placeId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/competition?place_id=${encodeURIComponent(placeId)}&category=${encodeURIComponent(category)}`);
        const data = await res.json();
        // Defensive check: API might return business object or lead object
        const bData = data.business || data.lead;
        if (bData) {
          setBusiness(bData);
          setCompetitors(data.competitors || { tier1: [], tier2: [], tier3: [] });
          setCounts(data.counts || { tier1: 0, tier2: 0, tier3: 0 });
        }
      } catch (e) {
        console.error("Competition API call failed:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [params, category]);

  // 5. ROI CALCULATION
  useEffect(() => {
    if (!counts?.tier1) return;
    fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        competitorCounts: { 
          tier1: counts.tier1, 
          tier2: (counts.tier2 || 0) - (counts.tier1 || 0), 
          tier3: (counts.tier3 || 0) - (counts.tier2 || 0) 
        },
        avgTicket,
      }),
    })
      .then(r => r.json())
      .then(d => setPricings(d.pricings))
      .catch(() => {});
  }, [counts, avgTicket]);

  // 6. SYNC LOGIC (SCROLL & CATEGORY)
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
      if (Math.abs(pos - scrollRef.current) > 50) {
        scrollRef.current = pos;
        updateDoc(stateDoc, { scrollPos: pos }).catch(() => setDoc(stateDoc, { scrollPos: pos, category, avgTicket }, { merge: true }));
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => { unsub(); window.removeEventListener('scroll', handleScroll); };
  }, [user, services, params, category, avgTicket]);

  // 7. ACTIONS
  const updateLiveCategory = async (cat) => {
    setCategory(cat);
    const sessionId = params?.get('sessionId') || 'demo-session';
    const isMirror = params?.get('mirror') === 'true';
    if (!isMirror && services && user) {
      const stateDoc = doc(services.db, 'artifacts', services.appId, 'public', 'data', 'sync_states', sessionId);
      await setDoc(stateDoc, { category: cat }, { merge: true });
    }
  };

  const handleLock = async () => {
    setLockSuccess(true);
    const sessionId = params?.get('sessionId') || 'demo-session';
    if (services && user) {
      const stateDoc = doc(services.db, 'artifacts', services.appId, 'public', 'data', 'sync_states', sessionId);
      await setDoc(stateDoc, { lockSuccess: true }, { merge: true });
    }
  };

  // 8. RENDER STATES
  if (loading && !business) {
    return (
      <div className="min-h-screen bg-[#060810] flex flex-col items-center justify-center p-8">
        <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
        <p className="mt-6 text-white font-black text-xs uppercase tracking-[0.3em] animate-pulse">Initializing Competitive Matrix</p>
      </div>
    );
  }

  if (lockSuccess) {
    return (
      <div className="min-h-screen bg-[#060810] flex flex-col items-center justify-center p-8 text-center">
        <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center mb-8 relative">
           <Lock className="w-10 h-10 text-emerald-400" />
           <div className="absolute inset-0 border-2 border-emerald-500/30 rounded-full animate-ping" />
        </div>
        <h1 className="text-4xl font-black text-white italic tracking-tighter mb-4 uppercase">Zone Locked!</h1>
        <p className="text-gray-400 text-sm max-w-sm mb-8 leading-relaxed">Congratulations. <strong>{business?.name || business?.businessName}</strong> is now protected.</p>
        <button onClick={() => setLockSuccess(false)} className="px-8 py-4 bg-gray-900 border border-gray-800 rounded-2xl text-[10px] font-black uppercase text-gray-500">Close Secure Portal</button>
      </div>
    );
  }

  const isMirror = params?.get('mirror') === 'true';

  return (
    <div className="min-h-screen bg-[#060810] text-gray-100 font-sans pb-32">
      <header className="bg-gray-900/60 border-b border-gray-800 px-6 py-5 sticky top-0 z-50 backdrop-blur-xl flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-indigo-500 fill-indigo-500" />
          <span className="font-black tracking-tighter text-xl uppercase italic">Agentic<span className="text-indigo-500">Life</span></span>
        </div>
        {isMirror && <div className="bg-red-600 text-[10px] font-black px-3 py-1.5 rounded-full animate-pulse shadow-lg shadow-red-900/40">LIVE MIRROR</div>}
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          <div className="w-full lg:w-[420px] space-y-8 flex-shrink-0">
            <div className="space-y-4">
               <h2 className="text-3xl font-black text-white italic tracking-tighter">{business?.name || business?.businessName || 'Your Business'}</h2>
               <p className="text-gray-500 text-xs font-bold leading-relaxed">{business?.address || 'Orlando, FL'}</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Concierge View</h3>
              {stingDone ? <PhotoCarousel photos={business?.photos} /> : <StingAnimation competitor={competitors.tier1[0] || competitors.tier2[0]} business={business} stingMessage="We intercept customers at peak intent." onDone={() => setStingDone(true)} />}
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-3xl p-6">
               <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 mb-6 flex items-center gap-2"><Search className="w-3 h-3" /> Select Your Category</h3>
               <div className="grid grid-cols-2 gap-2">
                  {['Restaurant', 'Pizza', 'Sushi', 'Cafe', 'Bar', 'Bakery'].map(cat => (
                    <button key={cat} onClick={() => updateLiveCategory(cat)} className={`py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${category === cat ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-900/40' : 'bg-gray-800/40 border-gray-700 text-gray-500 hover:border-gray-500'}`}>{cat}</button>
                  ))}
               </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Competitive Rings</h3>
              <CompetitorList title="Local Lock" count={counts.tier1} items={competitors.tier1} color="#38bdf8" />
              <CompetitorList title="Neighborhood Control" count={counts.tier2} items={competitors.tier2} color="#818cf8" />
              <CompetitorList title="Area Ownership" count={counts.tier3} items={competitors.tier3} color="#fbbf24" />
            </div>
          </div>

          <div className="flex-1 space-y-12">
            <div>
              <h3 className="text-4xl font-black text-white italic tracking-tighter mb-4">Dominance Projection</h3>
              <div className="flex flex-wrap gap-2 mb-10">
                {TICKET_OPTIONS.map(t => (
                  <button key={t.value} onClick={() => setAvgTicket(t.value)} className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${avgTicket === t.value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-500'}`}>{t.label}</button>
                ))}
              </div>
              {pricings ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{pricings.map(tp => <TierCard key={tp.tier.id} tp={tp} onLock={handleLock} />)}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{[1,2,3].map(i => <div key={i} className="h-[400px] bg-gray-900/50 rounded-3xl animate-pulse border border-gray-800" />)}</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes scaleUp { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-scaleUp { animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slideUp { animation: slideUp 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
