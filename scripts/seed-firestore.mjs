#!/usr/bin/env node
/**
 * Firestore Seeder
 * Run with: node scripts/seed-firestore.mjs
 *
 * Seeds:
 *  - Default dispositions
 *  - Default campaign waves
 *  - Sample leads (for local testing)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore }        from 'firebase-admin/firestore';
import { readFileSync }        from 'fs';
import { createRequire }       from 'module';
import { config }              from 'dotenv';

config({ path: '.env.local' });

initializeApp({
  credential: cert({
    projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

// ── Dispositions ──────────────────────────────────────────────────────────────
const DISPOSITIONS = [
  { id: 'no_answer',    label: 'No Answer',       action: 'NO_ANSWER',    color: '#94a3b8', delayMinutes: 120,  isActive: true, sortOrder: 1 },
  { id: 'busy',         label: 'Busy',             action: 'BUSY',         color: '#f59e0b', delayMinutes: 5,    isActive: true, sortOrder: 2 },
  { id: 'voicemail',    label: 'Voicemail',        action: 'VOICEMAIL',    color: '#8b5cf6', delayMinutes: 1440, isActive: true, sortOrder: 3 },
  { id: 'recall',       label: 'Schedule Recall',  action: 'RECALL',       color: '#6366f1', delayMinutes: 0,    isActive: true, sortOrder: 4 },
  { id: 'success',      label: 'SUCCESS 🎯',       action: 'SUCCESS',      color: '#00ff88', delayMinutes: 0,    isActive: true, sortOrder: 5 },
  { id: 'dnc',          label: 'DNC',              action: 'DNC',          color: '#ef4444', delayMinutes: 0,    isActive: true, sortOrder: 6 },
  { id: 'wrong_number', label: 'Wrong Number',     action: 'WRONG_NUMBER', color: '#4b5563', delayMinutes: 0,    isActive: true, sortOrder: 7 },
];

// ── Campaign Waves ─────────────────────────────────────────────────────────────
const CAMPAIGNS = [
  {
    id: 'wave1',
    name: 'Wave 1 — General',
    isActive: true,
    startHourLocal: 9,
    endHourLocal: 20,
    timezone: 'America/New_York',
    description: 'General businesses — call during local business hours',
  },
  {
    id: 'wave2',
    name: 'Wave 2 — Pizza / Restaurants',
    isActive: false,
    startHourLocal: 11,
    endHourLocal: 22,
    timezone: 'America/New_York',
    description: 'Restaurants — call during lunch/dinner service windows',
  },
];

// ── Sample Leads ──────────────────────────────────────────────────────────────
const SAMPLE_LEADS = [
  { businessName: 'Bella\'s Bistro',   contactName: 'Maria Russo',    phone: '+15550000001', kgmid: 'ChIJ_sample_001', timezone: 'America/New_York',    utcOffsetHours: -5, campaign: 'wave1' },
  { businessName: 'Kim\'s Auto Shop',  contactName: 'David Kim',      phone: '+15550000002', kgmid: 'ChIJ_sample_002', timezone: 'America/Chicago',     utcOffsetHours: -6, campaign: 'wave1' },
  { businessName: 'Walsh Plumbing',    contactName: 'Patrick Walsh',  phone: '+15550000003', kgmid: 'ChIJ_sample_003', timezone: 'America/Los_Angeles', utcOffsetHours: -8, campaign: 'wave1' },
  { businessName: 'Tony\'s Pizza',     contactName: 'Tony Mancini',   phone: '+15550000004', kgmid: 'ChIJ_sample_004', timezone: 'America/New_York',    utcOffsetHours: -5, campaign: 'wave2' },
  { businessName: 'Park Fitness',      contactName: 'James Park',     phone: '+15550000005', kgmid: 'ChIJ_sample_005', timezone: 'America/Denver',      utcOffsetHours: -7, campaign: 'wave1' },
];

async function seed() {
  console.log('🌱 Seeding Firestore…\n');

  // Dispositions
  console.log('📋 Seeding dispositions…');
  for (const disp of DISPOSITIONS) {
    const { id, ...data } = disp;
    await db.collection('dispositions').doc(id).set(data, { merge: true });
    console.log(`   ✓ ${disp.label}`);
  }

  // Campaign waves
  console.log('\n📡 Seeding campaign waves…');
  for (const wave of CAMPAIGNS) {
    const { id, ...data } = wave;
    await db.collection('campaigns').doc(id).set(data, { merge: true });
    console.log(`   ✓ ${wave.name}`);
  }

  // Sample leads
  console.log('\n👥 Seeding sample leads…');
  const now = new Date().toISOString();
  for (const lead of SAMPLE_LEADS) {
    const ref = db.collection('leads').doc();
    await ref.set({
      ...lead,
      status:     'NEW',
      retryCount: 0,
      createdAt:  now,
      updatedAt:  now,
    });
    console.log(`   ✓ ${lead.businessName}`);
  }

  console.log('\n✅ Seed complete!\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
