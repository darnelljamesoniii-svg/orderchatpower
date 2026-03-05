'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, collection } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { 
  Lock, Search, TrendingUp, MapPin, ShieldCheck, 
  Zap, Clock, CheckCircle2, ChevronDown, ChevronUp, Star, Users, Phone
} from 'lucide-react';

// --- Safe Firebase Configuration Access ---
// Prerender-safe variable access
const getFirebaseConfig = () => {
  if (typeof __firebase_config !== 'undefined') {
    try {
      return JSON.parse(__firebase_config);
    } catch (e) {
      console.error("Failed to parse firebase config");
      return null;
    }
  }
  return null;
};

const getAppId = () => {
  const rawId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  // Sanitize slashes to prevent Firestore path segment errors
  return rawId.replace(/\//g, '_');
};

const initFirebase = () => {
  const config = getFirebaseConfig();
  if (!config) return { db: null, auth: null, appId: getAppId() };
  
  const app = getApps().length > 0 ? getApp() : initializeApp(config);
  return {
    db: getFirestore(app),
    auth: getAuth(app),
    appId: getAppId()
  };
};

const { db, auth, appId } = initFirebase();

// --- Utility Helpers ---
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0');
const currency = (n) => `$${fmt(n)}`;
const stars = (r) => {
  if (typeof r !== 'number' || isNaN(r)) return '';
  const count = Math.min(5, Math.max(0, Math.round(r)));
  return '★'.repeat(count) + '☆'.repeat(5 - count);
};

// --- Mock Search Params Hook ---
const useMockSearchParams = () => {
  const [params, setParams] = useState(new URLSearchParams());
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setParams(new URLSearchParams(window.location.search));
    }
  }, []);
  return { get: (key) => params.get(key) };
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

const CompetitorList = ({ title, count, items, color, onExpand }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-2xl overflow-hidden transition-all" style={{ borderColor: color + '40' }}>
      <button onClick={() => { const next = !open; setOpen(next); if (next) onExpand?.(); }} className="w-full flex items-center justify-between px-4 py-4 text-left hover:brightness-110 transition-all" style={{ background: color + '10' }}>
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
              <div key={c.placeId} className="px-4 py-3 flex items-center justify-between hover:bg-white/5 transition-colors">
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

const ROIBadge = ({ roi }) => {
  if (!roi) return null;
  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-emerald-400" />
        <span className="text-emerald-400 font-bold text-[10px] uppercase tracking-[0.2em]">ROI Projection</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-white font-black text-2xl tracking-tighter">{roi.roiMultiple || 0}×</div>
          <div className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Annual Return</div>
        </div>
        <div>
          <div className="text-white font-black text-2xl tracking-tighter">{currency(roi.newRevenuePerYear || 0)}</div>
          <div className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">New Rev/Yr</div>
        </div>
      </div>
      <div className="pt-2 border-t border-emerald-500/10 flex justify-between items-end">
        <div>
          <div className="text-emerald-400 font-bold text-sm">~{roi.newCustomersPerDay || 0}/day</div>
          <div className="text-gray-500 text-[9px]">New Traffic</div>
        </div>
        <div className="text-right">
          <div className="text-emerald-400 font-bold text-sm">{roi.paybackDays || 0} days</div>
          <div className="text-gray-500 text-[9px]">Break Even</div>
        </div>
      </div>
    </div>
  );
};

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
        <div className="flex gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {tp.tier.walkMinutes}m Walk</span>
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {tp.tier.driveMiles}mi Drive</span>
        </div>
      </div>
      <div className="p-6 space-y-6 flex-1 flex flex-col">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-800 text-white font-black text-xs border border-gray-700 group-hover:bg-white group-hover:text-black transition-all">✕</div>
          <span className="text-white text-sm font-bold tracking-tight">Knocks out {tp.competitorCount} competitors</span>
        </div>
        <ROIBadge roi={tp.roi} />
        <div className="space-y-2">
          {tp.paymentOptions.map(o => (
            <button key={o.id} onClick={() => setPayOpt(o.id)} className={`w-full text-left px-4 py-3 rounded-2xl border transition-all ${payOpt === o.id ? 'border-white/20 bg-white/5 ring-1 ring-white/10' : 'border-gray-800 text-gray-500 hover:border-gray-700'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest">{o.label}</span>
                {o.badge && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter" style={{ background: color, color: '#000' }}>{o.badge}</span>}
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
      <div className="absolute top-0 left-0 w-full h-1 bg-gray-800">
        <div className="h-full bg-indigo-500 animate-[loading_7s_linear_infinite]" />
      </div>
      <div className="text-center text-gray-500 text-[10px] uppercase tracking-[0.3em] font-black">Agentic Recommendation Engine</div>
      <div className="bg-white rounded-2xl px-5 py-4 flex items-center gap-3 shadow-xl">
        <Search className="w-5 h-5 text-gray-400" />
        <span className="text-gray-900 font-bold text-sm tracking-tight italic">best {competitor?.category || 'places'} near me</span>
        {phase === 'search' && <span className="ml-auto text-xs text-indigo-500 font-black animate-pulse uppercase tracking-tighter">analyzing…</span>}
      </div>
      {phase === 'spinning' && (
        <div className="text-center space-y-3 animate-fadeIn">
          <div className="text-indigo-400 text-[11px] font-bold">Scanning local lock...</div>
          <div className="flex justify-center gap-2 flex-wrap">
            {[business?.name || 'Your Business', competitor?.name || 'Local Rival', 'Local Rival', 'Top Rated'].map((n, i) => (
              <div key={i} className="text-[10px] font-bold px-3 py-1.5 rounded-full bg-gray-800 text-gray-400 animate-pulse border border-gray-700">{n}</div>
            ))}
          </div>
        </div>
      )}
      {(phase === 'result' || phase === 'message') && (
        <div className="bg-white rounded-3xl p-5 shadow-2xl transform animate-scaleUp">
          <div className="text-[10px] text-gray-400 mb-3 font-black uppercase tracking-widest">Recommended Choice:</div>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center text-3xl shadow-inner shadow-indigo-200">📍</div>
            <div className="flex-1">
              <div className="font-black text-gray-900 text-base leading-tight">{competitor?.name || 'Local Rival'}</div>
              <div className="text-amber-500 text-xs font-black">{stars(competitor?.rating)} {competitor?.rating?.toFixed(1) || '4.8'}</div>
              <div className="text-gray-400 text-[10px] font-bold">{competitor?.distanceMetres ? `${(competitor.distanceMetres / 1609).toFixed(1)}mi from here` : 'Nearby'}</div>
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
  const searchParams = useMockSearchParams();
  const placeId = searchParams.get('place_id');
  const sessionId = searchParams.get('sessionId') || 'demo-session';
  const isMirror = searchParams.get('mirror') === 'true';

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

  // 1. Auth Initialization
  useEffect(() => {
    const init = async () => {
      if (!auth) return;
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed:", err);
      }
    };
    init();
    const unsubscribe = auth ? onAuthStateChanged(auth, setUser) : () => {};
    return () => unsubscribe();
  }, []);

  // 2. Real-time Sync Listener
  useEffect(() => {
    if (!user || !sessionId || !db) return;
    
    // Path uses sanitized appId to ensure exactly 6 segments (Even)
    const stateDoc = doc(db, 'artifacts', appId, 'public', 'data', 'sync_states', sessionId);
    
    const unsubscribe = onSnapshot(stateDoc, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.category && data.category !== category) setCategory(data.category);
        if (data.avgTicket && data.avgTicket !== avgTicket) setAvgTicket(data.avgTicket);
        if (isMirror && typeof data.scrollPos === 'number') {
          window.scrollTo({ top: data.scrollPos, behavior: 'smooth' });
        }
        if (data.lockSuccess) setLockSuccess(true);
      }
    }, (err) => console.error("Sync error:", err));
    
    return () => unsubscribe();
  }, [user, sessionId, isMirror]);

  // 3. Fetch Data
  useEffect(() => {
    if (!placeId) return;
    setLoading(true);
    fetch(`/api/competition?place_id=${encodeURIComponent(placeId)}&category=${encodeURIComponent(category)}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setBusiness(data.business);
          setCompetitors(data.competitors || { tier1: [], tier2: [], tier3: [] });
          setCounts(data.counts || { tier1: 0, tier2: 0, tier3: 0 });
        }
      })
      .catch(e => console.error("Fetch failed:", e))
      .finally(() => setLoading(false));
  }, [placeId, category]);

  // 4. ROI Pricing
  useEffect(() => {
    if (!counts || !counts.tier1) return;
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
      .catch(e => console.error("Pricing error:", e));
  }, [counts, avgTicket]);

  // 5. Scroll Sync
  useEffect(() => {
    if (isMirror || !user || !sessionId || !db) return;
    const handleScroll = () => {
      const pos = window.scrollY;
      if (Math.abs(pos - scrollRef.current) > 50) {
        scrollRef.current = pos;
        const stateDoc = doc(db, 'artifacts', appId, 'public', 'data', 'sync_states', sessionId);
        updateDoc(stateDoc, { scrollPos: pos }).catch(() => {
          setDoc(stateDoc, { scrollPos: pos, category, avgTicket }, { merge: true });
        });
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMirror, user, sessionId, category, avgTicket]);

  const updateLiveCategory = async (cat) => {
    setCategory(cat);
    if (!isMirror && user && sessionId && db) {
      const stateDoc = doc(db, 'artifacts', appId, 'public', 'data', 'sync_states', sessionId);
      await setDoc(stateDoc, { category: cat }, { merge: true });
    }
  };

  const handleLock = async (tier) => {
    if (isMirror) return;
    setLockSuccess(true);
    if (user && sessionId && db) {
      const stateDoc = doc(db, 'artifacts', appId, 'public', 'data', 'sync_states', sessionId);
      await setDoc(stateDoc, { lockSuccess: true }, { merge: true });
    }
  };

  if (!placeId) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8 text-center text-white">
        <ShieldCheck className="w-16 h-16 text-gray-800 mb-6" />
        <h1 className="text-2xl font-black uppercase tracking-tighter mb-2 italic">Invalid Session</h1>
        <p className="text-gray-500 text-sm max-w-xs">Please use a valid unlock link provided by your AgenticLife representative.</p>
      </div>
    );
  }

  if (loading && !business) {
    return (
      <div className="min-h-screen bg-[#060810] flex flex-col items-center justify-center p-8 text-center">
        <div className="relative mb-6">
          <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
          <Zap className="absolute inset-0 m-auto w-6 h-6 text-indigo-500 fill-indigo-500 animate-pulse" />
        </div>
        <p className="text-white font-black text-xs uppercase tracking-[0.3em] animate-pulse">Initializing Competitive Matrix</p>
      </div>
    );
  }

  if (lockSuccess) {
    return (
      <div className="min-h-screen bg-[#060810] flex flex-col items-center justify-center p-8 text-center animate-fadeIn">
        <div className="w-24 h-24 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mb-8 relative">
           <Lock className="w-10 h-10 text-emerald-400" />
           <div className="absolute inset-0 border-2 border-emerald-500/30 rounded-full animate-ping" />
        </div>
        <h1 className="text-4xl font-black text-white italic tracking-tighter mb-4">ZONE LOCKED!</h1>
        <p className="text-gray-400 text-sm max-w-sm leading-relaxed mb-8 font-medium">Congratulations. <strong>{business?.name}</strong> is now the protected {category} recommendation for your selected ring. Exclusive visibility starts now.</p>
        <button className="px-8 py-4 bg-gray-900 border border-gray-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-500">Close Secure Portal</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060810] text-gray-100 font-sans pb-32">
      <header className="bg-gray-900/60 border-b border-gray-800 px-6 py-5 sticky top-0 z-50 backdrop-blur-xl flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-indigo-500 fill-indigo-500" />
          <span className="font-black tracking-tighter text-xl uppercase italic">Agentic<span className="text-indigo-500">Life</span></span>
        </div>
        {isMirror && (
          <div className="bg-red-600 text-[10px] font-black px-3 py-1.5 rounded-full animate-pulse flex items-center gap-2 shadow-lg shadow-red-900/40">
            <ActivityPulse /> LIVE MIRROR
          </div>
        )}
        {!isMirror && <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-indigo-400"><Clock className="w-3 h-3" /> Lock Expiring: 14:59</div>}
      </header>
      <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
          <div className="w-full lg:w-[420px] space-y-8 flex-shrink-0">
            <div className="space-y-4">
               <h2 className="text-3xl font-black text-white italic tracking-tighter">{business?.name || 'Loading Business...'}</h2>
               <p className="text-gray-500 text-xs font-bold leading-relaxed">{business?.address || 'No address provided'}</p>
            </div>
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">Concierge View</h3>
              {stingDone ? <PhotoCarousel photos={business?.photos} /> : <StingAnimation competitor={competitors.tier1[0] || competitors.tier2[0]} business={business} stingMessage="Right now, customers searching for your service are being routed to your highest-rated neighbor. We can flip that logic today." onDone={() => setStingDone(true)} />}
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
              <h2 className="text-xs font-black uppercase tracking-[0.4em] text-indigo-500 mb-2">ROI Engine</h2>
              <h3 className="text-4xl font-black text-white italic tracking-tighter mb-4">Dominance Projection</h3>
              <p className="text-gray-500 text-sm max-w-xl leading-relaxed mb-8">By locking your category, you become the exclusive recommendation in these zones. We've analyzed {counts.tier3} competitors to project your return.</p>
              <div className="flex flex-wrap gap-2 mb-10">
                {TICKET_OPTIONS.map(t => (
                  <button key={t.value} onClick={() => { setAvgTicket(t.value); if(!isMirror && user && db) updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'sync_states', sessionId), { avgTicket: t.value }); }} className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${avgTicket === t.value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-500 hover:border-gray-600'}`}>{t.label} <span className="opacity-40 ml-1">{t.range}</span></button>
                ))}
              </div>
              {pricings ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{pricings.map(tp => <TierCard key={tp.tier.id} tp={tp} onLock={handleLock} />)}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">{[1,2,3].map(i => <div key={i} className="h-[500px] bg-gray-900/50 rounded-3xl animate-pulse border border-gray-800" />)}</div>
              )}
            </div>
            <div className="bg-gray-900/50 border border-gray-800 rounded-[32px] p-8 space-y-6">
               <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Why Lock Now?</h3>
               <div className="grid md:grid-cols-2 gap-8">
                  {[
                    { icon: ShieldCheck, title: 'Total Exclusivity', desc: 'Once locked, your category is closed to others for 12 months.' },
                    { icon: Zap, title: 'Instant Activation', desc: 'Recommendation shifts happen in real-time across our concierge network.' },
                    { icon: Users, title: 'High Intent Traffic', desc: 'Directly intercepting customers at the moment of peak decision-making.' },
                    { icon: TrendingUp, title: 'Fixed ROI', desc: 'Avoid the bidding wars of Yelp and Google. One zone, one price.' }
                  ].map(item => (
                    <div key={item.title} className="flex gap-4">
                      <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center flex-shrink-0"><item.icon className="w-5 h-5 text-indigo-400" /></div>
                      <div>
                        <h4 className="text-white font-bold text-sm mb-1">{item.title}</h4>
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
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleUp { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadeIn { animation: fadeIn 0.4s ease-out forwards; }
        .animate-scaleUp { animation: scaleUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-slideUp { animation: slideUp 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
