# ⚡ Power Dialer CRM — Complete Setup Guide

> Multi-agent Sun-Chaser Power Dialer with SignalWire Softphone, Gemini AI Battle Cards, Square Payments, Resend Email, and Firestore real-time sync.

---

## Architecture Overview

```
/sales       → Agent Battle Station  (softphone + AI coach + concierge preview)
/supervisor  → Supervisor Dashboard  (PIN-protected — campaigns, imports, monitoring)
/concierge   → Consumer Chatbot      (prospect-facing restaurant finder)
/unlock      → Prospect LP           (zone pricing, competitor analysis, Square checkout)
```

---

## Prerequisites

| Service          | What you need                                              |
|------------------|------------------------------------------------------------|
| **Firebase**     | Project with Firestore enabled, service account JSON       |
| **SignalWire**   | Space URL, Project ID, API Token, phone number             |
| **Gemini**       | API key from Google AI Studio                              |
| **Square**       | App credentials + Location ID (sandbox first)              |
| **Resend**       | API key + verified sending domain                          |
| **Google Maps**  | Places API key + Maps JavaScript API key                   |
| **Node.js**      | v18 or higher                                              |

---

## Step 1 — Clone & Install

```bash
cd power-dialer-crm
npm install
```

---

## Step 2 — Environment Variables

```bash
cp .env.local.example .env.local
```

---

### Firebase

1. Firebase Console → Create project → Enable Firestore (production mode)
2. Project Settings → Service Accounts → Generate new private key
3. Fill in from the downloaded JSON:

```env
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n"
```

4. Project Settings → General → Your apps → Add Web App → copy config:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

Required Firestore composite indexes (Firebase Console → Firestore → Indexes):

| Collection  | Fields                                                    |
|-------------|-----------------------------------------------------------|
| `leads`     | `status` ASC + `nextAvailableAt` ASC                     |
| `leads`     | `status` ASC + `campaign` ASC + `createdAt` ASC          |
| `leads`     | `status` ASC + `ownerAgentId` ASC + `callbackDueAt` ASC  |
| `call_logs` | `startedAt` DESC                                          |

---

### SignalWire

1. Log in at `https://yourspace.signalwire.com` → Settings → Credentials:

```env
SIGNALWIRE_SPACE_URL=yourspace.signalwire.com
SIGNALWIRE_PROJECT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SIGNALWIRE_API_TOKEN=PTxxxxxx...
SIGNALWIRE_REST_API_TOKEN=PTxxxxxx...
SIGNALWIRE_PHONE_NUMBER=+15550000000
```

> API_TOKEN and REST_API_TOKEN are the same value.

2. Voice → LaML Webhooks → Create:
   - Request URL: `https://your-domain.com/api/signalwire/webhook`
   - Status Callback: `https://your-domain.com/api/signalwire/status`

For local dev use ngrok: `ngrok http 3000` then set the ngrok URL as the webhook.

---

### Gemini

```env
GEMINI_API_KEY=AIzaSy...
```

Get it at: https://aistudio.google.com/app/apikey

---

### Square

```env
# Sandbox
SQUARE_ACCESS_TOKEN=EAAAl...
SQUARE_BASE_URL=https://connect.squareupsandbox.com
SQUARE_LOCATION_ID=your_location_id

# Production (swap when ready)
# SQUARE_BASE_URL=https://connect.squareup.com
```

---

### Resend

1. Sign up at resend.com → API Keys → Create:

```env
RESEND_API_KEY=re_...
EMAIL_FROM=noreply@yourdomain.com
EMAIL_REPLY_TO=team@yourdomain.com
```

Verify your sending domain at resend.com/domains before go-live. Without verification you can only send to your own email.

---

### Google Places & Maps

Enable in Google Cloud Console: Places API, Maps JavaScript API, Geocoding API.

```env
GOOGLE_PLACES_API_KEY=AIzaSy...          # server-side, no restrictions needed
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy... # client-side, restrict to your domain
```

---

### App URL — CRITICAL

**This is used to build every demo link sent to prospects. Wrong value = broken links.**

```env
# Local dev
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Production — your actual deployed domain, no trailing slash
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

On Vercel: set this in Dashboard → Settings → Environment Variables. Set separate values for Preview vs Production.

---

### Supervisor PIN

```env
# Agents cannot access /supervisor without this PIN
# Change from the default before going live
NEXT_PUBLIC_SUPERVISOR_PIN=1234
```

---

### Internal Secret

```env
INTERNAL_API_SECRET=change_me_to_a_long_random_string
```

---

## Step 3 — Seed Firestore

```bash
node scripts/seed-firestore.mjs
```

This creates default dispositions and two starter campaigns. You can create more campaigns from the Supervisor Dashboard after this.

---

## Step 4 — Run Locally

```bash
npm run dev
```

| URL          | Who                  | Access          |
|--------------|----------------------|-----------------|
| /sales       | Agents               | Open URL        |
| /supervisor  | Supervisors          | PIN required    |
| /concierge   | Prospects            | Public          |
| /unlock      | Prospects            | Needs place_id  |

---

## Step 5 — Creating Campaigns

1. Go to `/supervisor`
2. Campaigns panel → click **New**
3. Name it anything — "Pizza NYC", "Restaurants Atlanta", etc.
4. Set calling hours + timezone
5. Click **Create Campaign**
6. Toggle **Active** when ready to dial
7. When importing CSV leads, pick the campaign from the dropdown

No `campaign` column needed in the CSV — you assign it at import time.

---

## Step 6 — Deploy to Vercel

```bash
npm install -g vercel
vercel
```

After deploying:
1. Update SignalWire webhook URLs to production domain
2. Set `NEXT_PUBLIC_APP_URL` to production domain in Vercel env vars
3. Run `firebase deploy --only firestore:rules,firestore:indexes`
4. Run seed script against production

---

## CSV Import Format

Download template: `/leads-template.csv`

| Column           | Required | Notes                                    |
|------------------|----------|------------------------------------------|
| `businessName`   | yes      |                                          |
| `contactName`    | yes      |                                          |
| `phone`          | yes      | E.164 or 10-digit, auto-formatted        |
| `phone2`         | no       | Second contact number                    |
| `email`          | no       | Used to prefill demo link email          |
| `kgmid`          | yes      | Google Maps Place ID                     |
| `timezone`       | yes      | IANA string e.g. America/New_York        |
| `utcOffsetHours` | yes      | Integer e.g. -5 for EST                  |

Column names are flexible — `Phone`, `phone_number`, `PHONE` all map to `phone`.
Deduplication: rows with matching `phone` or `kgmid` are skipped.

---

## Queue Priority

```
1. CALLBACK_MANUAL — owned by this agent, due now
2. CALLBACK_MANUAL — owner offline > 15 min (released to pool)
3. CALLBACK_AUTO — due now
4. NEW — active campaign, within calling window
```

Retry exhaustion: leads move to EXHAUSTED after 6 retries automatically.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Device not ready" | Check SIGNALWIRE_* vars + LaML Webhook URL is live |
| "No active campaigns" | /supervisor → Campaigns → toggle one Active |
| Demo links broken / point to wrong domain | Set NEXT_PUBLIC_APP_URL to your actual domain |
| Camera not showing | Browser needs HTTPS or localhost for getUserMedia |
| Square 401 | Token and SQUARE_BASE_URL must match (sandbox vs prod) |
| Resend "domain not verified" | Verify domain at resend.com/domains first |
| Permission denied in Firestore | Run seed script + deploy firestore.rules |
| Queue always empty | (1) Campaign active? (2) Calling hours overlap leads' local time? (3) Leads status=NEW? |
| Supervisor PIN rejected | Default is 1234 — set NEXT_PUBLIC_SUPERVISOR_PIN in .env.local |

---

## Production Checklist

- [ ] All .env.local values filled in
- [ ] NEXT_PUBLIC_APP_URL set to production domain
- [ ] NEXT_PUBLIC_SUPERVISOR_PIN changed from 1234
- [ ] SignalWire webhook URLs updated to production domain
- [ ] Resend domain verified
- [ ] Square on production credentials (not sandbox)
- [ ] Firestore indexes and rules deployed
- [ ] Seed script run against production Firestore
- [ ] At least one campaign created and Active in /supervisor
- [ ] HTTPS enabled (required for getUserMedia + SignalWire browser SDK)

---

*Built for AgenticLife — Power Dialer CRM v5.0*
