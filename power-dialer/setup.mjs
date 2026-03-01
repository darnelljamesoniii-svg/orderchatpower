#!/usr/bin/env node
/**
 * ⚡ Power Dialer CRM — One-Command Setup
 *
 * Does everything a Supabase migration does, for Firebase:
 *   1. Validates your .env.local has required values
 *   2. Seeds Firestore with dispositions + campaigns
 *   3. Prints what to run next for rules + indexes
 *
 * Usage:
 *   node setup.mjs
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue }      from 'firebase-admin/firestore';
import { config }                        from 'dotenv';
import { existsSync }                    from 'fs';

// ── Load env ──────────────────────────────────────────────────────────────────
config({ path: '.env.local' });

const REQUIRED_VARS = [
  'FIREBASE_ADMIN_PROJECT_ID',
  'FIREBASE_ADMIN_CLIENT_EMAIL',
  'FIREBASE_ADMIN_PRIVATE_KEY',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'SIGNALWIRE_SPACE_URL',
  'SIGNALWIRE_PROJECT_ID',
  'SIGNALWIRE_API_TOKEN',
  'SIGNALWIRE_PHONE_NUMBER',
  'NEXT_PUBLIC_APP_URL',
];

const OPTIONAL_VARS = [
  'GEMINI_API_KEY',
  'SQUARE_ACCESS_TOKEN',
  'RESEND_API_KEY',
  'GOOGLE_PLACES_API_KEY',
];

// ── Validate ──────────────────────────────────────────────────────────────────
console.log('\n⚡ Power Dialer CRM — Setup\n');

if (!existsSync('.env.local')) {
  console.error('❌  .env.local not found. Run: cp .env.local.example .env.local\n   Then fill in your values.\n');
  process.exit(1);
}

let hasErrors = false;
for (const v of REQUIRED_VARS) {
  if (!process.env[v]) {
    console.error(`❌  Missing required: ${v}`);
    hasErrors = true;
  }
}

if (hasErrors) {
  console.error('\nFill in the missing values in .env.local and run setup again.\n');
  process.exit(1);
}

console.log('✅  All required env vars present\n');

for (const v of OPTIONAL_VARS) {
  if (!process.env[v]) {
    console.warn(`⚠️   Optional (not required to dial): ${v}`);
  }
}

// ── Init Firebase Admin ───────────────────────────────────────────────────────
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

// ── Seed dispositions ─────────────────────────────────────────────────────────
console.log('\n📋 Seeding dispositions…');

const DISPOSITIONS = [
  { id: 'no_answer',    label: 'No Answer',    action: 'NO_ANSWER',    color: '#6b7280', sortOrder: 1, delayMinutes: 120, isActive: true },
  { id: 'busy',         label: 'Busy',         action: 'BUSY',         color: '#f59e0b', sortOrder: 2, delayMinutes: 5,   isActive: true },
  { id: 'voicemail',    label: 'Voicemail',    action: 'VOICEMAIL',    color: '#8b5cf6', sortOrder: 3, delayMinutes: 1440,isActive: true },
  { id: 'recall',       label: 'Schedule Recall', action: 'RECALL',   color: '#3b82f6', sortOrder: 4, delayMinutes: 0,   isActive: true },
  { id: 'not_interested',label:'Not Interested',action:'NO_ANSWER',    color: '#6b7280', sortOrder: 5, delayMinutes: 2880,isActive: true },
  { id: 'success',      label: 'SUCCESS 🎉',   action: 'SUCCESS',      color: '#10b981', sortOrder: 6, delayMinutes: 0,   isActive: true },
  { id: 'dnc',          label: 'Do Not Call',  action: 'DNC',          color: '#ef4444', sortOrder: 7, delayMinutes: 0,   isActive: true },
  { id: 'wrong_number', label: 'Wrong Number', action: 'WRONG_NUMBER', color: '#ef4444', sortOrder: 8, delayMinutes: 0,   isActive: true },
];

for (const d of DISPOSITIONS) {
  const ref  = db.collection('dispositions').doc(d.id);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(d);
    console.log(`   ✓ ${d.label}`);
  } else {
    console.log(`   — ${d.label} (already exists, skipped)`);
  }
}

// ── Seed campaigns ────────────────────────────────────────────────────────────
console.log('\n📢 Seeding starter campaigns…');

const CAMPAIGNS = [
  {
    id:             'wave1',
    name:           'Wave 1 — General',
    description:    'Default campaign for general outreach',
    isActive:       false,
    startHourLocal: 9,
    endHourLocal:   20,
    timezone:       'America/New_York',
  },
  {
    id:             'wave2',
    name:           'Wave 2 — Pizza',
    description:    'Pizza restaurant outreach',
    isActive:       false,
    startHourLocal: 10,
    endHourLocal:   21,
    timezone:       'America/New_York',
  },
];

for (const c of CAMPAIGNS) {
  const ref  = db.collection('campaigns').doc(c.id);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(c);
    console.log(`   ✓ ${c.name}`);
  } else {
    console.log(`   — ${c.name} (already exists, skipped)`);
  }
}

// ── Seed caller ID settings ───────────────────────────────────────────────────
console.log('\n📞 Seeding caller ID settings…');

const callerIdRef  = db.doc('settings/caller_ids');
const callerIdSnap = await callerIdRef.get();

if (!callerIdSnap.exists) {
  await callerIdRef.set({
    numbers:      [process.env.SIGNALWIRE_PHONE_NUMBER],
    currentIndex: 0,
  });
  console.log(`   ✓ Caller ID set to ${process.env.SIGNALWIRE_PHONE_NUMBER}`);
  console.log(`   → Add more numbers in /supervisor → Settings when ready`);
} else {
  console.log('   — Caller IDs already configured, skipped');
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log('\n✅  Firestore seeded successfully!\n');
console.log('─────────────────────────────────────────────────────');
console.log('Next steps:\n');
console.log('1. Deploy Firestore rules + indexes (run once):');
console.log('   npm install -g firebase-tools');
console.log(`   firebase login`);
console.log(`   firebase use ${process.env.FIREBASE_ADMIN_PROJECT_ID}`);
console.log('   firebase deploy --only firestore\n');
console.log('2. Deploy to Vercel:');
console.log('   vercel\n');
console.log('3. Set NEXT_PUBLIC_APP_URL in Vercel dashboard to your deployment URL');
console.log('   Then: vercel --prod\n');
console.log('4. Update SignalWire webhook URLs to:');
console.log(`   ${process.env.NEXT_PUBLIC_APP_URL}/api/signalwire/webhook`);
console.log(`   ${process.env.NEXT_PUBLIC_APP_URL}/api/signalwire/status\n`);
console.log('5. Go to /supervisor → Campaigns → toggle one Active');
console.log('6. Import your CSV leads');
console.log('7. Agents open /sales → Get Next Lead → start dialing 🚀\n');
console.log('─────────────────────────────────────────────────────\n');

// ── Create first supervisor account ──────────────────────────────────────────
// Only runs if no supervisor exists yet

import { getAuth } from 'firebase-admin/auth';

const authInstance = getAuth();

console.log('\n👤 Checking for supervisor account…');

const usersSnap = await db.collection('users').where('role', '==', 'supervisor').limit(1).get();

if (!usersSnap.empty) {
  console.log('   — Supervisor already exists, skipped');
  console.log(`   Existing: ${usersSnap.docs[0].data().email}`);
} else {
  // Prompt for supervisor email
  const supervisorEmail = process.env.SUPERVISOR_EMAIL ?? `admin@${
    (process.env.NEXT_PUBLIC_APP_URL ?? 'example.com').replace(/https?:\/\//, '')
  }`;
  const supervisorName  = process.env.SUPERVISOR_NAME ?? 'Admin';

  // Generate password
  const words   = ['Rocket','Storm','Blaze','Swift','Force','Apex','Surge','Titan'];
  const pw      = words[Math.floor(Math.random() * words.length)] + Math.floor(1000 + Math.random() * 9000);

  try {
    const fbUser = await authInstance.createUser({
      email:         supervisorEmail,
      password:      pw,
      displayName:   supervisorName,
      emailVerified: true,
    });

    await db.collection('users').doc(fbUser.uid).set({
      uid:         fbUser.uid,
      email:       supervisorEmail,
      displayName: supervisorName,
      role:        'supervisor',
      createdAt:   new Date().toISOString(),
      createdBy:   'setup',
      active:      true,
    });

    console.log(`   ✓ Supervisor account created!`);
    console.log(`\n   ┌─────────────────────────────────────────┐`);
    console.log(`   │  SUPERVISOR LOGIN CREDENTIALS            │`);
    console.log(`   │  Email:    ${supervisorEmail.padEnd(30)} │`);
    console.log(`   │  Password: ${pw.padEnd(30)} │`);
    console.log(`   │  URL:      ${(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').padEnd(30)} │`);
    console.log(`   └─────────────────────────────────────────┘`);
    console.log(`\n   ⚠️  Save these credentials — password won't be shown again.\n`);
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      console.log(`   ⚠️  A Firebase Auth user with ${supervisorEmail} already exists.`);
      console.log(`   Run: firebase auth:export to find their UID, then manually add them to users collection as role: supervisor`);
    } else {
      throw err;
    }
  }
}
