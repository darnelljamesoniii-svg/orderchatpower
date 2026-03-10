#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { v4 as uuidv4 } from 'uuid';

function getArg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return '';
  return (process.argv[i + 1] ?? '').trim();
}

function pick(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && String(v).trim()) return String(v).trim();
  }
  return '';
}

const inFile = getArg('--in') || getArg('-i');
const outFile = getArg('--out') || getArg('-o') || 'unlock-links.out.csv';
const baseUrl = (getArg('--base') || 'https://orderchatpower.vercel.app').replace(/\/+$/, '');

if (!inFile) {
  console.error('Usage: node scripts/generate-unlock-links.mjs --in leads.csv --out links.csv [--base https://orderchatpower.vercel.app]');
  process.exit(1);
}

const raw = fs.readFileSync(inFile, 'utf8');
const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });

if (parsed.errors.length) {
  console.error('CSV parse errors:', parsed.errors.slice(0, 3));
}

const rows = parsed.data;
const out = [];

for (const row of rows) {
  const businessName = pick(row, ['businessName', 'name', 'Business Name', 'Business']);
  const address = pick(row, ['address', 'Address', 'Full_Address', 'full_address']);

  // Place id can come from multiple sources. If absent but name+address exist,
  // use /g/lookup resolver path supported by /api/competition.
  const placeId = pick(row, ['place_id', 'placeId', 'Place_ID', 'kgmid']) || ((businessName && address) ? '/g/lookup' : '');
  const sessionId = pick(row, ['sessionId', 'session_id']) || uuidv4();
  const keyword = pick(row, ['keyword', 'searchKeyword', 'search_keyword']);

  if (!placeId) {
    out.push({ ...row, sessionId, unlockLink: '', error: 'Missing place_id/placeId/kgmid and no name+address fallback.' });
    continue;
  }

  const params = new URLSearchParams();
  params.set('place_id', placeId);
  params.set('sessionId', sessionId);
  if (businessName) params.set('name', businessName);
  if (address) params.set('address', address);
  if (keyword) params.set('keyword', keyword);

  const unlockLink = `${baseUrl}/unlock?${params.toString()}`;
  out.push({ ...row, sessionId, unlockLink, error: '' });
}

const csv = Papa.unparse(out);
fs.writeFileSync(outFile, csv, 'utf8');

const total = out.length;
const ok = out.filter(r => r.unlockLink).length;
const failed = total - ok;

console.log(`Wrote ${outFile}`);
console.log(`Rows: ${total} | Links: ${ok} | Missing: ${failed}`);
