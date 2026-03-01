'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Papa from 'papaparse';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { COLLECTIONS } from '@/lib/collections';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Upload, FileText, CheckCircle, AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { CsvRow } from '@/lib/importer';
import type { CampaignWave } from '@/types';

const EXPECTED_COLUMNS = ['businessName', 'contactName', 'phone', 'kgmid', 'timezone', 'utcOffsetHours'];

// Flexible column name aliases — handles messy real-world CSV headers
const COLUMN_ALIASES: Record<string, string[]> = {
  businessName:   ['businessName', 'business_name', 'Business Name', 'name', 'business'],
  contactName:    ['contactName', 'contact_name', 'Contact Name', 'contact', 'owner'],
  phone:          ['phone', 'Phone', 'phone_number', 'PHONE', 'Phone Number', 'primary_phone'],
  phone2:         ['phone2', 'Phone2', 'phone_2', 'secondary_phone', 'alt_phone', 'alternate_phone'],
  email:          ['email', 'Email', 'EMAIL', 'email_address'],
  kgmid:          ['kgmid', 'place_id', 'placeId', 'google_place_id', 'KGMID'],
  timezone:       ['timezone', 'Timezone', 'time_zone', 'tz'],
  utcOffsetHours: ['utcOffsetHours', 'utc_offset', 'utcOffset', 'utc_offset_hours', 'offset'],
  address:        ['address', 'Address', 'full_address', 'street_address', 'location'],
};

function resolveRow(r: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      if (r[alias] !== undefined) { out[canonical] = r[alias]; break; }
    }
  }
  return out;
}

function checkMissingColumns(r: Record<string, string>): string[] {
  const resolved = resolveRow(r);
  return EXPECTED_COLUMNS.filter(c => !resolved[c]);
}

interface ImportResult {
  imported:   number;
  duplicates: number;
  errors:     string[];
}

export default function CsvImporter() {
  const fileRef    = useRef<HTMLInputElement>(null);
  const [file,     setFile]     = useState<File | null>(null);
  const [preview,  setPreview]  = useState<CsvRow[]>([]);
  const [result,   setResult]   = useState<ImportResult | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [campaign, setCampaign] = useState<string>('');
  const [campaigns, setCampaigns] = useState<CampaignWave[]>([]);
  const [error,    setError]    = useState<string | null>(null);

  // Load campaigns from Firestore — supervisor picks one before importing
  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.CAMPAIGNS), orderBy('name'));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as CampaignWave));
      setCampaigns(list);
      // Auto-select first campaign if none selected yet
      if (!campaign && list.length > 0) setCampaign(list[0].id);
    });
  }, []);

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);

    Papa.parse<Record<string, string>>(f, {
      header:       true,
      skipEmptyLines: true,
      complete: (results) => {
        const missing = checkMissingColumns(results.data[0] ?? {});
        if (missing.length > 0) {
          setError(`Missing required columns: ${missing.join(', ')}. Check the template for accepted column names.`);
          return;
        }
        const rows = results.data.slice(0, 5).map(r => {
          const m = resolveRow(r);
          return {
            businessName:   m.businessName,
            contactName:    m.contactName,
            phone:          m.phone,
            phone2:         m.phone2,
            email:          m.email,
            kgmid:          m.kgmid,
            timezone:       m.timezone,
            utcOffsetHours: Number(m.utcOffsetHours),
            campaign,
            address:        m.address,
          };
        }) as CsvRow[];
        setPreview(rows);
      },
    });
  }, [campaign]);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data.map(r => {
          const m = resolveRow(r);
          return {
            businessName:   m.businessName,
            contactName:    m.contactName,
            phone:          m.phone,
            phone2:         m.phone2,
            email:          m.email,
            kgmid:          m.kgmid,
            timezone:       m.timezone,
            utcOffsetHours: Number(m.utcOffsetHours),
            campaign,
            address:        m.address,
          };
        }) as CsvRow[];

        try {
          const res = await fetch('/api/leads/import', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ rows }),
          });
          const data: ImportResult = await res.json();
          if (!res.ok) throw new Error((data as unknown as { error: string }).error);
          setResult(data);
          toast.success(`Imported ${data.imported} leads`);
        } catch (err: unknown) {
          toast.error(err instanceof Error ? err.message : 'Import failed');
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const reset = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Card header={<><Upload size={12} /> Lead Importer (CSV)</>} noPadding>
      <div className="p-4 space-y-4">
        {/* Campaign selector — dynamic from Firestore */}
        <div>
          <label className="text-[10px] text-muted uppercase tracking-widest block mb-1.5 font-bold">
            Assign to Campaign
          </label>
          {campaigns.length === 0 ? (
            <div className="text-xs text-muted py-2">
              No campaigns yet — create one in the Campaigns panel first.
            </div>
          ) : (
            <select
              value={campaign}
              onChange={e => setCampaign(e.target.value)}
              className="w-full bg-card border border-border rounded px-2.5 py-2 text-sm text-white focus:outline-none focus:border-accent"
            >
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.isActive ? ' ✓ Active' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Drop zone */}
        <label className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent/40 transition-colors group">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
          <Upload size={28} className="text-muted group-hover:text-accent transition-colors" />
          <div className="text-center">
            <div className="text-sm text-white font-rajdhani font-bold">Drop CSV or click to browse</div>
            <div className="text-[10px] text-muted mt-0.5">Required: businessName, contactName, phone, kgmid, timezone, utcOffsetHours</div>
          </div>
          {file && (
            <div className="flex items-center gap-2 bg-neon/10 border border-neon/20 rounded px-3 py-1.5">
              <FileText size={12} className="text-neon" />
              <span className="text-neon text-xs font-mono">{file.name}</span>
              <button onClick={(e) => { e.preventDefault(); reset(); }} className="text-muted hover:text-danger ml-1">
                <X size={12} />
              </button>
            </div>
          )}
        </label>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 rounded-lg p-3">
            <AlertTriangle size={14} className="text-danger flex-shrink-0" />
            <span className="text-danger text-xs">{error}</span>
          </div>
        )}

        {/* Preview Table */}
        {preview.length > 0 && !error && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Preview (first 5 rows)</div>
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    {['Business', 'Phone', 'KGMID', 'TZ'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-muted font-rajdhani tracking-widest uppercase text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview.map((r, i) => (
                    <tr key={i} className="hover:bg-card">
                      <td className="px-3 py-2 text-white truncate max-w-[140px]">{r.businessName}</td>
                      <td className="px-3 py-2 font-mono text-muted">{r.phone}</td>
                      <td className="px-3 py-2 font-mono text-muted text-[10px]">{r.kgmid}</td>
                      <td className="px-3 py-2 text-muted text-[10px]">{r.timezone}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="bg-neon/5 border border-neon/20 rounded-lg p-4 space-y-2 animate-slideUp">
            <div className="flex items-center gap-2 text-neon font-rajdhani font-bold">
              <CheckCircle size={16} /> Import Complete
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-neon font-rajdhani font-bold text-xl">{result.imported}</div>
                <div className="text-[10px] text-muted uppercase tracking-wide">Imported</div>
              </div>
              <div>
                <div className="text-amber font-rajdhani font-bold text-xl">{result.duplicates}</div>
                <div className="text-[10px] text-muted uppercase tracking-wide">Dupes Skipped</div>
              </div>
              <div>
                <div className="text-danger font-rajdhani font-bold text-xl">{result.errors.length}</div>
                <div className="text-[10px] text-muted uppercase tracking-wide">Errors</div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-danger text-[10px] font-mono">{e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {file && !error && !result && (
          <Button variant="primary" size="lg" className="w-full" loading={loading} onClick={handleImport}>
            <Upload size={14} /> Import to {campaigns.find(c => c.id === campaign)?.name ?? campaign}
          </Button>
        )}
      </div>
    </Card>
  );
}
