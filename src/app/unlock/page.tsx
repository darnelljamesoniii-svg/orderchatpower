'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PlaceDetails, NearbyPlace } from '@/lib/google-places';
import type { TierPricing } from '@/lib/pricing';
import ActivityPulse from './_components/ActivityPulse';
import { initSession, initReturnVisitDetection, track } from '@/lib/session-tracker';

function fmt(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }); }
function currency(n: number) { return `$${fmt(n)}`; }
function stars(r?: number) { if (!r) return ''; return '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r)); }

function PhotoCarousel({ photos }: { photos: { url: string }[] }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (photos.length < 2) return;
    const id = setInterval(() => setIdx(i => (i + 1) % photos.length), 3500);
    return () => clearInterval(id);
  }, [photos.length]);
  if (!photos.length) return <div className="w-full h-44 bg-gray-800 rounded-2xl" />;
  return (
    <div className="relative w-full h-44 rounded-2xl overflow-hidden">
      {photos.map((p, i) => (
        <img key={i} src={p.url} alt="" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === idx ? 'opacity-100' : 'opacity-0'}`} />
      ))}
    </div>
  );
}

function CompetitorList({ title, count, items, color, onExpand }: {
  title: string; count: number; items: NearbyPlace[]; color: string; onExpand?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded-2xl overflow-hidden" style={{ borderColor: color + '40' }}>
      <button onClick={() => { const next = !open; setOpen(next); if (next) onExpand?.(); }}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        style={{ background: color + '10' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
          <span className="font-bold text-white text-sm">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono font-bold text-sm" style={{ color }}>{count} competitors</span>
          <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-gray-800">
          {items.length === 0 ? (
            <div className="px-4 py-3 text-gray-500 text-sm">No competitors in this ring.</div>
          ) : items.map(c => (
            <div key={c.placeId} className="px-4 py-2.5 flex items-center justify-between">
              <div>
                <div className="text-white text-sm font-medium">{c.name}</div>
                <div className="text-gray-400 text-xs">{c.category}</div>
              </div>
              <div className="text-right">
                <div className="text-amber-400 text-xs">{stars(c.rating)} {c.rating?.toFixed(1)}</div>
                <div className="text-gray-500 text-xs">
                  {c.distanceMetres ? `${(c.distanceMetres / 1000).toFixed(1)}km` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ROIBadge({ roi }: { roi: TierPricing['roi'] }) {
  return (
    <div className="bg-gradient-to-r from-emerald-900/50 to-emerald-800/30 border border-emerald-500/30 rounded-xl p-3 space-y-1.5">
      <div className="text-emerald-400 font-bold text-xs uppercase tracking-widest">ROI Projection</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-white font-bold text-xl">{roi.roiMultiple}×</div>
          <div className="text-gray-400 text-xs">return</div>
        </div>
        <div>
          <div className="text-white font-bold text-xl">{currency(roi.newRevenuePerYear)}</div>
          <div className="text-gray-400 text-xs">new revenue/yr</div>
        </div>
        <div>
          <div className="text-emerald-400 font-bold text-base">~{roi.newCustomersPerDay}/day</div>
          <div className="text-gray-400 text-xs">new customers</div>
        </div>
        <div>
          <div className="text-emerald-400 font-bold text-base">{roi.paybackDays} days</div>
          <div className="text-gray-400 text-xs">to break even</div>
        </div>
      </div>
      <div className="text-gray-500 text-[10px]">Based on {fmt(roi.monthlySearches)} monthly searches in zone · 3% conversion rate</div>
    </div>
  );
}

function TierCard({ tp, businessPlaceId, business, onLock, onPulseStop }: {
  tp: TierPricing;
  businessPlaceId: string;
  business: PlaceDetails;
  onLock: (tp: TierPricing) => void;
  onPulseStop: () => void;
}) {
  const [payOpt, setPayOpt] = useState<'full' | 'afterpay'>('full');
  const [loading, setLoading] = useState(false);
  const { color } = tp.tier;

  return (
    <div className="bg-gray-900 border rounded-2xl overflow-hidden flex flex-col" style={{ borderColor: color + '50' }}>
      <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${color}20, transparent)` }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-bold text-white text-base">{tp.tier.name}</div>
            <div className="text-gray-400 text-xs">{tp.tier.tagline}</div>
          </div>
          <div className="text-right">
            <div className="font-mono font-bold text-2xl text-white">{currency(tp.annualPrice)}</div>
            <div className="text-gray-400 text-xs">{currency(tp.monthlyEquiv)}/mo equiv.</div>
          </div>
        </div>
        <div className="flex gap-3 mt-2 text-xs text-gray-400">
          <span>🚶 {tp.tier.walkMinutes}-min walk</span>
          <span>🚗 {tp.tier.driveMiles}-mile drive</span>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs" style={{ background: color + '20', color }}>✕</div>
          <span className="text-white text-sm font-medium">Knocks out {tp.competitorCount} competitors</span>
        </div>
        <div className="text-xs px-2 py-1 rounded-full w-fit" style={{ background: color + '15', color }}>
          {tp.density.label}
        </div>
        <ROIBadge roi={tp.roi} />
        <div className="space-y-1.5">
          <div className="text-gray-400 text-xs uppercase tracking-widest font-bold">Payment</div>
          {tp.paymentOptions.filter((o) => o.id !== 'bailout').map(o => (
            <button key={o.id} onClick={() => setPayOpt(o.id as typeof payOpt)}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                payOpt === o.id ? 'border-white/30 bg-white/10 text-white' : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}>
              <div className="flex items-center justify-between">
                <span className="font-bold">{o.label}</span>
                {o.badge && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: color + '30', color }}>{o.badge}</span>}
              </div>
              <div className="text-gray-500 mt-0.5">{o.description}</div>
              <div className="font-mono font-bold mt-1">
                {o.id === 'full' && `${currency(o.annualTotal)} today`}
                {o.id === 'afterpay' && `4 × ${currency(o.monthly!)} · Total ${currency(o.annualTotal)}`}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-auto pt-2">
          {tp.autoCheckout ? (
            <button
              onClick={() => { setLoading(true); onPulseStop(); track.lockClicked(tp.tier.id); onLock(tp); }}
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all disabled:opacity-50"
              style={{ background: color, color: '#060810' }}
            >
              {loading ? 'Processing…' : `🔒 Lock ${tp.tier.name}`}
            </button>
          ) : (
            <a href="tel:+18005550000"
              className="block w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase text-center border"
              style={{ borderColor: color, color }}>
              📞 Call to Lock This Zone
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function StingAnimation({ competitor, business, stingMessage, onDone }: {
  competitor: NearbyPlace;
  business: PlaceDetails;
  stingMessage: string;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<'search' | 'spinning' | 'result' | 'message'>('search');
  const businessCategoryLabel =
    (business.category || 'business').replace(/_/g, ' ').toLowerCase();

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('spinning'), 1200);
    const t2 = setTimeout(() => setPhase('result'), 3000);
    const t3 = setTimeout(() => setPhase('message'), 4200);
    const t4 = setTimeout(() => onDone(), 6500);
    return () => [t1, t2, t3, t4].forEach(clearTimeout);
  }, [onDone]);

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
      <div className="text-center text-gray-400 text-xs uppercase tracking-widest font-bold">Live Recommendation Engine</div>
      <div className="bg-white rounded-full px-4 py-2.5 flex items-center gap-2 shadow">
        <span className="text-gray-400">🔍</span>
        <span className="text-gray-600 text-sm">Recommendation request: best {businessCategoryLabel}</span>
        {phase === 'search' && <span className="ml-auto text-xs text-gray-400 animate-pulse">searching…</span>}
      </div>
      {phase === 'spinning' && (
        <div className="text-center space-y-2">
          <div className="text-gray-400 text-xs">Evaluating local recommendations…</div>
          <div className="flex justify-center gap-2 flex-wrap">
            {[business.name, competitor.name, 'Other Place', business.name].map((n, i) => (
              <div key={i} className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-400 animate-pulse"
                style={{ animationDelay: `${i * 0.2}s` }}>{n}</div>
            ))}
          </div>
        </div>
      )}
      {(phase === 'result' || phase === 'message') && (
        <div className="bg-white rounded-2xl p-4 shadow-lg">
          <div className="text-xs text-gray-400 mb-2 font-medium">Top recommendation returned:</div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center text-2xl">🍕</div>
            <div>
              <div className="font-bold text-gray-900">{competitor.name}</div>
              <div className="text-amber-400 text-xs">{stars(competitor.rating)} {competitor.rating?.toFixed(1)}</div>
              <div className="text-gray-400 text-xs">{competitor.distanceMetres ? `${(competitor.distanceMetres / 1000).toFixed(1)}km away` : 'In area'}</div>
            </div>
            <div className="ml-auto bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full">✓ Recommended</div>
          </div>
        </div>
      )}
      {phase === 'message' && (
        <div className="bg-red-950/50 border border-red-500/30 rounded-xl p-3 animate-slideUp">
          <p className="text-red-300 text-sm leading-relaxed">{stingMessage}</p>
        </div>
      )}
    </div>
  );
}

function ConciergeDemoFrame({ placeId, keyword }: { placeId?: string; keyword?: string }) {
  const src = placeId
    ? `/concierge?place_id=${encodeURIComponent(placeId)}`
    : '/concierge';

  return (
    <div className="w-full h-[800px] rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
      <iframe
        src={src}
        className="w-full h-full border-0"
        title="Concierge Demo"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}

const TICKET_OPTIONS = [
  { label: 'Fast Casual',     range: '$12–18', value: 15 },
  { label: 'Casual Dining',   range: '$22–35', value: 28 },
  { label: 'Polished Casual', range: '$35–55', value: 45 },
  { label: 'Fine Dining',     range: '$65+',   value: 75 },
];

function UnlockPageContent() {
  const params       = useSearchParams();
  const placeId      = params.get('place_id');
  const sessionId    = params.get('sessionId')     ?? undefined;
  const agentId      = params.get('agentId')       ?? undefined;
  const agentPreview = params.get('agent_preview') === 'true';
  const businessName = params.get('name')          ?? '';
  const businessAddr = params.get('address')       ?? '';
  const keyword      = params.get('keyword')       ?? '';

  const [business,      setBusiness]      = useState<PlaceDetails | null>(null);
  const [stingComp,     setStingComp]     = useState<NearbyPlace | null>(null);
  const [stingMessage,  setStingMessage]  = useState('');
  const [competitors,   setCompetitors]   = useState<{ tier1: NearbyPlace[]; tier2: NearbyPlace[]; tier3: NearbyPlace[] } | null>(null);
  const [counts,        setCounts]        = useState<{ tier1: number; tier2: number; tier3: number } | null>(null);
  const [pricings,      setPricings]      = useState<TierPricing[] | null>(null);
  const [avgTicket,     setAvgTicket]     = useState(28);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [stingDone,     setStingDone]     = useState(false);
  const [lockedTier,    setLockedTier]    = useState<TierPricing | null>(null);
  const [locking,       setLocking]       = useState(false);
  const [lockSuccess,   setLockSuccess]   = useState(false);
  const [pulsesStopped, setPulsesStopped] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!placeId || !sessionId || agentPreview) return;
    initSession(sessionId, placeId, agentId);
    initReturnVisitDetection(sessionId, placeId, agentId);
  }, [placeId, sessionId, agentId, agentPreview]);

  useEffect(() => {
    if (!placeId) { setError('No business ID provided.'); setLoading(false); return; }
    fetch(`/api/competition?place_id=${encodeURIComponent(placeId)}&name=${encodeURIComponent(businessName)}&address=${encodeURIComponent(businessAddr)}${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ''}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setBusiness(data.business);
        setStingComp(data.stingCompetitor);
        setStingMessage(data.stingMessage);
        setCompetitors(data.competitors);
        setCounts(data.counts);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [placeId, businessName, businessAddr, keyword]);

  useEffect(() => {
    if (!counts) return;
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

  const handleLock = useCallback(async (tp: TierPricing) => {
    if (!business || !placeId) return;
    setLocking(true);
    setLockedTier(tp);
    try {
      const sqRes = await fetch('/api/square/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: tp.annualPrice * 100,
          description: `${tp.tier.name} — ${business.name} Zone Lock`,
          referenceId: placeId,
          buyerName:   business.name,
        }),
      });
      const { url } = await sqRes.json();
      if (url) { window.open(url, '_blank'); track.paymentOpened(); setPulsesStopped(true); }
      setLockSuccess(true);
    } catch {
      alert('Something went wrong. Please try again or call us.');
    } finally {
      setLocking(false);
    }
  }, [business, placeId]);

  if (!placeId) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white p-8 text-center">
        <div>
          <div className="text-5xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold mb-2">Invalid Link</h1>
          <p className="text-gray-400">This link requires a business ID. Please use the link sent to you by your AgenticLife representative.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 text-sm">Analysing your competitive landscape…</p>
        </div>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white p-8 text-center">
        <div>
          <div className="text-5xl mb-4">⚠️</div>
          <p className="text-gray-400">{error || 'Business not found.'}</p>
        </div>
      </div>
    );
  }

  if (lockSuccess && lockedTier) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8 text-center space-y-6">
        <div className="text-6xl animate-bounce">🔒</div>
        <h1 className="text-3xl font-bold text-white">Zone Locked!</h1>
        <p className="text-gray-300 max-w-sm">
          <strong>{business.name}</strong> is now the exclusive {business.category} recommendation in your {lockedTier.tier.name} zone.
          Your 12-month price protection starts today.
        </p>
        <div className="bg-emerald-900/30 border border-emerald-500/30 rounded-2xl p-4 max-w-sm w-full">
          <div className="text-emerald-400 font-bold text-sm uppercase tracking-widest mb-2">Your Zone</div>
          <div className="text-white text-sm space-y-1">
            <div>📍 {lockedTier.tier.walkMinutes}-min walk · {lockedTier.tier.driveMiles}-mile drive</div>
            <div>✕ {lockedTier.competitorCount} competitors locked out</div>
            <div>💰 {currency(lockedTier.annualPrice)}/year · renews in 12 months</div>
          </div>
        </div>
        <p className="text-gray-500 text-sm">A confirmation has been sent to your email. Your representative will be in touch shortly.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {competitors && !agentPreview && (
        <ActivityPulse business={business} competitors={competitors} stopped={pulsesStopped} />
      )}
      <div className="bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800 px-4 py-6 text-center">
        <div className="text-xs uppercase tracking-widest text-indigo-400 font-bold mb-1">AgenticLife · Exclusive Territory</div>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">{business.name}</h1>
        <p className="text-gray-400 text-sm">{business.address}</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 lg:py-10">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">

          <div className="w-full lg:w-[420px] lg:sticky lg:top-4 lg:self-start flex-shrink-0">
            <div className="mb-3">
              <h2 className="font-bold text-white text-lg">See What Your Customers See</h2>
              <p className="text-gray-400 text-sm mt-0.5">This is the concierge experience your customers use right now — watch who gets recommended.</p>
            </div>
            {stingComp && !stingDone ? (
              <StingAnimation
                competitor={stingComp}
                business={business}
                stingMessage={stingMessage}
                onDone={() => { setStingDone(true); track.stingCompleted(); }}
              />
            ) : (
              <ConciergeDemoFrame placeId={placeId} keyword={keyword} />
            )}
          </div>

          <div className="flex-1 space-y-6">
            {counts && (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                <div className="text-gray-400 text-xs uppercase tracking-widest font-bold mb-2">Market Summary</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                  <div className="bg-gray-800 rounded-lg px-3 py-2">1-mile zone: <span className="font-bold text-white">{counts.tier1}</span></div>
                  <div className="bg-gray-800 rounded-lg px-3 py-2">3-mile zone: <span className="font-bold text-white">{counts.tier2}</span></div>
                  <div className="bg-gray-800 rounded-lg px-3 py-2">5-mile zone: <span className="font-bold text-white">{counts.tier3}</span></div>
                </div>
              </div>
            )}

            <div ref={pricingRef}>
              <h2 className="font-bold text-white text-lg mb-1">Lock Your Zone</h2>
              <p className="text-gray-400 text-sm mb-4">Pick your average ticket size so we can show you the ROI for each tier.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                {TICKET_OPTIONS.map(t => (
                  <button key={t.value} onClick={() => { setAvgTicket(t.value); track.avgTicketSelected(t.value); }}
                    className={`rounded-xl px-3 py-2.5 text-xs font-bold text-center transition-all border ${
                      avgTicket === t.value
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}>
                    <div>{t.label}</div>
                    <div className={avgTicket === t.value ? 'text-indigo-300' : 'text-gray-500'}>{t.range}</div>
                  </button>
                ))}
              </div>

              {pricings ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {pricings.map(tp => (
                    <TierCard
                      key={tp.tier.id}
                      tp={tp}
                      businessPlaceId={placeId}
                      business={business}
                      onLock={handleLock}
                      onPulseStop={() => setPulsesStopped(true)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-96 bg-gray-900 rounded-2xl animate-pulse" />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <div className="text-gray-400 text-xs uppercase tracking-widest font-bold mb-3">How We Compare</div>
              <div className="space-y-2">
                {[
                  { name: 'Yelp Enhanced',        price: '$400/mo',                                                    note: 'Still competing with everyone',    exclusive: false },
                  { name: 'Google LSA',            price: '$350+/mo',                                                   note: 'Pay per click, no exclusivity',    exclusive: false },
                  { name: 'AgenticLife Zone Lock', price: `${currency(pricings?.[0]?.monthlyEquiv ?? 150)}/mo equiv.`, note: 'You are the ONLY recommendation',  exclusive: true  },
                ].map(item => (
                  <div key={item.name} className={`flex items-center justify-between px-3 py-2.5 rounded-xl ${item.exclusive ? 'bg-emerald-900/30 border border-emerald-500/30' : 'bg-gray-800'}`}>
                    <div>
                      <div className={`font-bold text-sm ${item.exclusive ? 'text-emerald-400' : 'text-white'}`}>{item.name}</div>
                      <div className="text-gray-500 text-xs">{item.note}</div>
                    </div>
                    <div className={`font-mono font-bold text-sm ${item.exclusive ? 'text-emerald-400' : 'text-gray-400'}`}>{item.price}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnlockPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <UnlockPageContent />
    </Suspense>
  );
}
