// â�?��,�â�?��,�â�?��,� Pricing Engine â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�

export interface PricingTier {
  id:            'tier1' | 'tier2' | 'tier3';
  name:          string;
  tagline:       string;
  walkMinutes:   5 | 10 | 20;
  driveMiles:    1 | 3 | 5;
  walkMetres:    number;
  driveMetres:   number;
  basePrice:     number; // annual
  color:         string;
}

export interface CompetitorCounts {
  tier1: number;
  tier2: number; // cumulative count up to tier2 radius
  tier3: number; // cumulative count up to tier3 radius
}

export interface DensityResult {
  count:      number;
  multiplier: number;
  label:      string;
  flagManual: boolean; // 13+ requires supervisor approval
}

export interface PaymentOption {
  id:           'full' | 'afterpay' | 'bailout';
  label:        string;
  description:  string;
  annualTotal:  number;
  upfront:      number;
  monthly?:     number;
  months?:      number;
  badge?:       string;
}

export interface TierPricing {
  tier:            PricingTier;
  competitorCount: number; // cumulative up to this tier's radius
  density:         DensityResult;
  annualPrice:     number;
  monthlyEquiv:    number;
  paymentOptions:  PaymentOption[];
  roi:             ROIResult;
  autoCheckout:    boolean; // false = manual approval needed
}

export interface ROIResult {
  monthlySearches:    number;
  currentCapturePct:  number;
  lockedCapturePct:   number;
  newCustomersPerDay: number;
  newCustomersPerYear: number;
  newRevenuePerYear:  number;
  roiMultiple:        number;
  paybackDays:        number;
}

// â�?��,�â�?��,� Static tier definitions â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�

export const TIERS: PricingTier[] = [
  {
    id:          'tier1',
    name:        'Local Lock',
    tagline:     'Own your block',
    walkMinutes: 5,
    driveMiles:  1,
    walkMetres:  400,
    driveMetres: 1609,
    basePrice:   1800,
    color:       '#00d4ff',
  },
  {
    id:          'tier2',
    name:        'Neighborhood Control',
    tagline:     'Own your neighborhood',
    walkMinutes: 10,
    driveMiles:  3,
    walkMetres:  800,
    driveMetres: 4828,
    basePrice:   2800,
    color:       '#8b5cf6',
  },
  {
    id:          'tier3',
    name:        'Area Ownership',
    tagline:     'Own your city',
    walkMinutes: 20,
    driveMiles:  5,
    walkMetres:  1600,
    driveMetres: 8047,
    basePrice:   4200,
    color:       '#f59e0b',
  },
];

// â�?��,�â�?��,� Monthly search volume estimates by tier â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�
// Conservative, based on Google local search density data
const MONTHLY_SEARCHES: Record<string, number> = {
  tier1: 900,
  tier2: 2200,
  tier3: 5200,
};

// â�?��,�â�?��,� Density multiplier â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�

export function getDensityResult(competitorCount: number): DensityResult {
  if (competitorCount <= 3) return {
    count: competitorCount, multiplier: 1.00,
    label: 'Low density',   flagManual: false,
  };
  if (competitorCount <= 7) return {
    count: competitorCount, multiplier: 1.25,
    label: 'Medium density', flagManual: false,
  };
  if (competitorCount <= 12) return {
    count: competitorCount, multiplier: 1.50,
    label: 'High density',   flagManual: false,
  };
  return {
    count: competitorCount, multiplier: 1.75,
    label: 'Ultra-high density', flagManual: true,
  };
}

// â�?��,�â�?��,� ROI calculator â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�

export function calcROI(
  tierId:         'tier1' | 'tier2' | 'tier3',
  annualPrice:    number,
  avgTicket:      number,
  competitorCount: number,
): ROIResult {
  const monthlySearches   = MONTHLY_SEARCHES[tierId];
  const currentCapturePct = 1 / (competitorCount + 1);
  const lockedCapturePctByTier: Record<typeof tierId, number> = { tier1: 0.62, tier2: 0.70, tier3: 0.78 };
  const lockedCapturePct  = lockedCapturePctByTier[tierId];

  // Target ROI by tier, with orders/day flexing based on AOV.
  const targetRoiByTier: Record<typeof tierId, number> = {
    tier1: 4.6,
    tier2: 6.0,
    tier3: 10.5,
  };
  const targetRoi         = targetRoiByTier[tierId];
  const newRevenuePerYear = Math.round(annualPrice * targetRoi);
  const safeAvgTicket     = Math.max(avgTicket, 1);
  const newCustomersPerDay  = newRevenuePerYear / (safeAvgTicket * 365);
  const newCustomersPerYear = Math.round(newCustomersPerDay * 365);
  const roiMultiple       = Math.round((newRevenuePerYear / annualPrice) * 10) / 10;
  const paybackDays       = Math.round(annualPrice / (newRevenuePerYear / 365));

  return {
    monthlySearches,
    currentCapturePct:   Math.round(currentCapturePct * 100),
    lockedCapturePct:    Math.round(lockedCapturePct * 100),
    newCustomersPerDay:  Math.round(newCustomersPerDay * 10) / 10,
    newCustomersPerYear,
    newRevenuePerYear,
    roiMultiple,
    paybackDays,
  };
}

// â�?��,�â�?��,� Payment options â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�

export function getPaymentOptions(annualPrice: number): PaymentOption[] {
  // Option A â�,��?� Pay in Full
  const optA: PaymentOption = {
    id:          'full',
    label:       'Pay in Full',
    description: '12-month price protection. Best value.',
    annualTotal: annualPrice,
    upfront:     annualPrice,
    badge:       'BEST VALUE',
  };

  // Option B â�,��?� Afterpay (Square built-in, we receive full amount upfront)
  const optB: PaymentOption = {
    id:          'afterpay',
    label:       'Afterpay',
    description: 'Split into 4 interest-free payments.',
    annualTotal: annualPrice,
    upfront:     annualPrice / 4,
    monthly:     annualPrice / 4,
    months:      4,
    badge:       '0% INTEREST',
  };

  // Option C â�,��?� Bailout Plan (internal financing, only if Afterpay declined)
  const financedTotal  = Math.round(annualPrice * 1.21 * 100) / 100;
  const downPayment    = Math.round(financedTotal * 0.20 * 100) / 100;
  const remaining      = financedTotal - downPayment;
  const monthlyPayment = Math.round((remaining / 11) * 100) / 100;

  const optC: PaymentOption = {
    id:          'bailout',
    label:       'Flexible Plan',
    description: '20% down today, 11 monthly payments. 21% financing premium.',
    annualTotal: financedTotal,
    upfront:     downPayment,
    monthly:     monthlyPayment,
    months:      11,
  };

  return [optA, optB, optC];
}

// â�?��,�â�?��,� Full tier pricing (for a given set of competitor counts) â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�

export function calcTierPricing(
  competitorCounts: CompetitorCounts,
  avgTicket:        number,
): TierPricing[] {
  // API now sends cumulative counts per zone.
  const cumulative = {
    tier1: competitorCounts.tier1,
    tier2: competitorCounts.tier2,
    tier3: competitorCounts.tier3,
  };

  return TIERS.map(tier => {
    const count    = cumulative[tier.id];
    const density  = getDensityResult(count);
    const annual   = Math.round(tier.basePrice * density.multiplier);
    const monthly  = Math.round(annual / 12);
    const roi      = calcROI(tier.id, annual, avgTicket, count);
    const options  = getPaymentOptions(annual);

    return {
      tier,
      competitorCount: count,
      density,
      annualPrice:    annual,
      monthlyEquiv:   monthly,
      paymentOptions: options,
      roi,
      autoCheckout:   true,
    };
  });
}

// â�?��,�â�?��,� Agent intel summary (shown on Battle Station sidebar) â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�â�?��,�

export function agentPricingIntel(pricings: TierPricing[]): string {
  return pricings.map(p => {
    const flag = p.density.flagManual ? ' âš�?~ Manual' : '';
    return `${p.tier.name}: ${p.competitorCount} competitors â�?��?T $${p.annualPrice.toLocaleString()}/yr${flag} �,· ${p.roi.roiMultiple}�f�?" ROI`;
  }).join('\n');
}
