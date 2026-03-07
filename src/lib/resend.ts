// --- Resend Email Library -------------------------------------------------------

const RESEND_API_KEY = process.env.RESEND_API_KEY!;
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@agenticlife.com';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'team@agenticlife.com';
const FALLBACK_APP_URL = 'https://agenticlife.com';

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string; // plain text
  placeId?: string;
  sessionId?: string;
  businessName?: string;
  address?: string;
}

export interface DemoLinkInput {
  placeId?: string;
  kgmid?: string;
  sessionId?: string;
  businessName?: string;
  address?: string;
  agentId?: string;
  agentPreview?: boolean;
  absolute?: boolean;
}

function normalizedAppUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? FALLBACK_APP_URL).trim();
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function extractPlaceId(rawInput: string): string {
  const raw = rawInput.trim();
  if (!raw) return '';

  if (!raw.includes('://')) {
    return raw;
  }

  try {
    const url = new URL(raw);

    const placeIdParam = url.searchParams.get('place_id');
    if (placeIdParam?.trim()) return placeIdParam.trim();

    const q = url.searchParams.get('q') ?? '';
    const qMatch = q.match(/place_id:([^\s]+)/i);
    if (qMatch?.[1]) return qMatch[1].trim();

    const gPathMatch = url.pathname.match(/(\/g\/[^/?#]+)/i);
    if (gPathMatch?.[1]) return gPathMatch[1].trim();

    return raw;
  } catch {
    return raw;
  }
}

export function resolveLeadPlaceId(input: { placeId?: string; kgmid?: string }): string {
  const value = (input.placeId ?? input.kgmid ?? '').trim();
  return extractPlaceId(value);
}

function buildUnlockPath(input: DemoLinkInput): string {
  const resolvedPlaceId = resolveLeadPlaceId(input);
  const fallbackLookupPlaceId = (input.businessName || input.address) ? '/g/lookup' : '';
  const placeId = resolvedPlaceId || fallbackLookupPlaceId;
  if (!placeId) return '';

  const params = new URLSearchParams();
  params.set('place_id', placeId);

  if (input.sessionId) params.set('sessionId', input.sessionId);
  if (input.businessName) params.set('name', input.businessName);
  if (input.address) params.set('address', input.address);
  if (input.agentId) params.set('agentId', input.agentId);
  if (input.agentPreview) params.set('agent_preview', 'true');

  return `/unlock?${params.toString()}`;
}

export function buildDemoLink(input: DemoLinkInput): string;
export function buildDemoLink(placeId: string, sessionId?: string): string;
export function buildDemoLink(arg1: string | DemoLinkInput, sessionId?: string): string {
  const input = typeof arg1 === 'string' ? { placeId: arg1, sessionId } : arg1;
  const path = buildUnlockPath(input);
  if (!path) return '';
  return input.absolute === false ? path : `${normalizedAppUrl()}${path}`;
}

export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  const { to, subject, body, placeId, sessionId, businessName, address } = params;

  const demoLink = buildDemoLink({
    placeId,
    sessionId,
    businessName,
    address,
    absolute: true,
  }) || null;

  // Build HTML email
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 20px; }
    .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 560px; margin: 0 auto; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .logo { font-size: 20px; font-weight: 800; color: #4f46e5; margin-bottom: 24px; }
    .body { color: #374151; font-size: 15px; line-height: 1.7; white-space: pre-wrap; }
    .cta { display: inline-block; margin-top: 24px; background: #4f46e5; color: #fff !important; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">AgenticLife</div>
    <div class="body">${body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    ${demoLink ? `
    <a href="${demoLink}" class="cta">View Your Competitive Zone -></a>
    <p style="margin-top:12px;color:#9ca3af;font-size:12px;">Or copy this link: <a href="${demoLink}" style="color:#4f46e5;">${demoLink}</a></p>
    ` : ''}
    <div class="footer">
      You received this from AgenticLife. Reply to this email to reach our team.<br>
      (c) ${new Date().getFullYear()} AgenticLife
    </div>
  </div>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      reply_to: EMAIL_REPLY_TO,
      to: [to],
      subject,
      html,
      text: body + (demoLink ? `\n\nView your competitive zone: ${demoLink}` : ''),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Resend error ${res.status}: ${JSON.stringify(err)}`);
  }

  return res.json();
}

export function defaultEmailSubject(businessName: string): string {
  return `${businessName} - Your competitive zone analysis is ready`;
}

export function defaultEmailBody(businessName: string, agentName: string): string {
  return `Hi there,

I wanted to follow up on our conversation about ${businessName}.

I've put together a personalized competitive analysis showing exactly how many businesses in your area are currently receiving recommendations instead of you - and what it would cost to lock your zone exclusively.

Click the link below to see your full analysis, including:
* Every competitor within your zone
* What customers searching nearby are currently seeing
* Your ROI projection for locking your area

This analysis is personalized to ${businessName} and will show you a live demo of how the recommendation engine works.

Looking forward to hearing from you,
${agentName}
AgenticLife`;
}

