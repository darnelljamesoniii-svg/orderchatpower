# ⚡ Power Dialer CRM — Complete Setup Guide

> Multi-agent Sun-Chaser Power Dialer with Twilio Softphone, Gemini AI Battle Cards, Square Payments, and Firestore real-time sync.

---

## Architecture Overview

```
/sales       → Agent Battle Station (softphone + mirror + AI + concierge iframe)
/supervisor  → Supervisor Dashboard (lead import, wave controls, live monitoring)

/api/leads/next          → Sun-Chaser queue engine (Firestore transaction lock)
/api/leads/dispose       → Disposition handler (Square + SMS trigger on SUCCESS)
/api/leads/import        → CSV importer with deduplication
/api/twilio/token        → Browser Voice SDK token
/api/twilio/webhook      → TwiML app endpoint
/api/gemini/battlecard   → Real-time AI objection coaching
/api/square/payment-link → Square checkout link creation
```

---

## Prerequisites

| Service         | What you need                                      |
|-----------------|----------------------------------------------------|
| **Firebase**    | Project with Firestore enabled, service account JSON |
| **Twilio**      | Account SID, Auth Token, phone number, TwiML App, API Key+Secret |
| **Gemini**      | API key from Google AI Studio                      |
| **Square**      | App credentials, Location ID (sandbox first)       |
| **Node.js**     | v18 or higher                                      |

---

## Step 1 — Clone & Install

```bash
# Unzip the bundle and enter the directory
cd power-dialer-crm
npm install
```

---

## Step 2 — Environment Variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in every value. Detailed instructions per service:

### Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com) → Create project
2. Enable **Firestore Database** (production mode)
3. Go to Project Settings → **Service Accounts** → Generate new private key
4. Copy values from the downloaded JSON into `.env.local`:
   - `FIREBASE_ADMIN_PROJECT_ID` = `project_id`
   - `FIREBASE_ADMIN_CLIENT_EMAIL` = `client_email`
   - `FIREBASE_ADMIN_PRIVATE_KEY` = `private_key` (keep `\n` characters as-is)
5. Go to Project Settings → **General** → Your apps → Web → copy config for `NEXT_PUBLIC_FIREBASE_*` vars

**Firestore Indexes required** (create in Firebase Console → Indexes):

| Collection | Fields                                     | Query scope |
|------------|--------------------------------------------|-------------|
| `leads`    | `status` ASC, `nextAvailableAt` ASC        | Collection  |
| `leads`    | `status` ASC, `campaign` ASC, `createdAt` ASC | Collection  |
| `call_logs`| `startedAt` DESC                           | Collection  |

### Twilio Setup

1. Log in to [Twilio Console](https://console.twilio.com)
2. Note your **Account SID** and **Auth Token** from the dashboard
3. Buy or use an existing **phone number** — paste as `TWILIO_PHONE_NUMBER`
4. Go to **Voice → TwiML Apps** → Create new:
   - Voice Request URL: `https://your-domain.com/api/twilio/webhook`
   - Method: POST
   - Copy the TwiML App SID → `TWILIO_TWIML_APP_SID`
5. Go to **Account → API Keys & Tokens** → Create Standard API Key:
   - Copy **SID** → `TWILIO_API_KEY`
   - Copy **Secret** (shown only once) → `TWILIO_API_SECRET`

### Gemini Setup

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key → paste as `GEMINI_API_KEY`

### Square Setup

1. Log in to [Square Developer](https://developer.squareup.com/apps)
2. Create or open your app
3. Go to **Credentials** tab:
   - Copy **Sandbox Access Token** → `SQUARE_ACCESS_TOKEN`
   - Set `SQUARE_BASE_URL=https://connect.squareupsandbox.com`
4. Go to **Locations** → copy Location ID → `SQUARE_LOCATION_ID`
5. For production: use Production Access Token and `https://connect.squareup.com`

---

## Step 3 — Seed Firestore

Run this once to create default dispositions, campaign waves, and sample leads:

```bash
node scripts/seed-firestore.mjs
```

Expected output:
```
🌱 Seeding Firestore…
📋 Seeding dispositions…
   ✓ No Answer
   ✓ Busy
   ...
✅ Seed complete!
```

---

## Step 4 — Run Locally

```bash
npm run dev
```

Open:
- **Agent view**: http://localhost:3000/sales
- **Supervisor**: http://localhost:3000/supervisor

> **Twilio webhook during local dev**: Use [ngrok](https://ngrok.com) to expose your local server:
> ```bash
> ngrok http 3000
> ```
> Update your TwiML App Voice URL to: `https://your-ngrok-id.ngrok.io/api/twilio/webhook`

---

## Step 5 — Deploy to Vercel

```bash
npm install -g vercel
vercel

# Set all env vars in Vercel dashboard or via CLI:
vercel env add TWILIO_ACCOUNT_SID
# ... repeat for all vars
```

After deploy, update your Twilio TwiML App URL to your production domain.

---

## CSV Lead Import Format

Download the template: `/leads-template.csv`

| Column           | Required | Example                     | Notes                              |
|------------------|----------|-----------------------------|-------------------------------------|
| `businessName`   | ✅        | Bella's Bistro              |                                     |
| `contactName`    | ✅        | Maria Russo                 |                                     |
| `phone`          | ✅        | +15550000001                | E.164 or 10-digit (auto-formatted)  |
| `email`          | ❌        | maria@bistro.com            |                                     |
| `kgmid`          | ✅        | ChIJ_abc123                 | Google Maps Place ID                |
| `timezone`       | ✅        | America/New_York            | IANA timezone string                |
| `utcOffsetHours` | ✅        | -5                          | Integer, e.g. -8 for PST            |
| `campaign`       | ✅        | wave1                       | `wave1` or `wave2`                  |
| `address`        | ❌        | 123 Main St                 |                                     |

**Deduplication**: The importer skips any row where `phone` or `kgmid` already exists in Firestore.

---

## Queue Priority Logic

The Sun-Chaser engine (`/api/leads/next`) serves leads in this strict order:

```
1. CALLBACK_MANUAL  (agent-scheduled recalls)   — nextAvailableAt <= NOW
2. CALLBACK_AUTO    (system recalls: busy/no answer/vm) — nextAvailableAt <= NOW
3. NEW              (fresh leads)               — filtered by calling window
```

**Sun-Chaser logic**: For fresh leads, the lead's local time is computed as:
```
localHour = (utcHour + utcOffsetHours + 24) % 24
```
Only leads whose `localHour` falls within the active campaign's `startHourLocal–endHourLocal` window are served.

**Retry exhaustion**: After 6 retries (`retryCount > 6`), the lead is automatically set to `EXHAUSTED`.

---

## Disposition Action Map

| Disposition    | Action in Firestore                                          |
|----------------|--------------------------------------------------------------|
| `NO_ANSWER`    | `status = CALLBACK_AUTO`, `nextAvailableAt = NOW + 2 hours` |
| `BUSY`         | `status = CALLBACK_AUTO`, `nextAvailableAt = NOW + 5 mins`  |
| `VOICEMAIL`    | `status = CALLBACK_AUTO`, `nextAvailableAt = NOW + 24 hrs`  |
| `RECALL`       | `status = CALLBACK_MANUAL`, `nextAvailableAt = agent-chosen time` |
| `SUCCESS`      | `status = CLOSED`, Square payment link created + SMS sent   |
| `DNC`          | `status = BLACKLISTED`                                       |
| `WRONG_NUMBER` | `status = BLACKLISTED`                                       |

Supervisors can create/edit/delete dispositions in real-time from `/supervisor`. Changes reflect instantly for all agents.

---

## Firestore Collections

| Collection     | Purpose                                    |
|----------------|--------------------------------------------|
| `leads`        | All lead records + queue state             |
| `agents`       | Agent status, call counts, revenue         |
| `dispositions` | Supervisor-configurable disposition buttons|
| `campaigns`    | Wave 1 / Wave 2 calling windows + toggles  |
| `call_logs`    | Per-call records with transcript snippets  |

---

## Security Rules (Firestore)

Add these to Firebase Console → Firestore → Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // All authenticated users can read/write during development
    // Tighten these for production with role-based rules
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Twilio "Device not ready" | Check API Key/Secret + TwiML App SID in `.env.local` |
| "No active campaign waves" | Go to `/supervisor` and toggle Wave 1 ON |
| Camera not showing | Browser needs HTTPS (or localhost) for `getUserMedia` |
| Square 401 error | Verify `SQUARE_ACCESS_TOKEN` and `SQUARE_BASE_URL` match (sandbox vs prod) |
| Firestore permission denied | Run the seed script; check Firestore security rules |
| Queue always empty | Verify leads are `status: NEW` and wave is active + hours overlap |
| Gemini battle cards not triggering | Check `GEMINI_API_KEY` + ensure microphone permission is granted |

---

## Production Checklist

- [ ] All `.env.local` values populated
- [ ] Firestore security rules tightened (role-based auth)
- [ ] Twilio webhook URL updated to production domain
- [ ] Square switched to production credentials
- [ ] Firestore composite indexes created
- [ ] `node scripts/seed-firestore.mjs` run against production
- [ ] Vercel environment variables set
- [ ] Custom domain configured (required for Twilio browser calls)
- [ ] HTTPS enabled (required for `getUserMedia` + Twilio SDK)

---

*Built for AgenticLife — Power Dialer CRM v1.0*
