'use client';

import { useMemo, useState } from 'react';
import Papa from 'papaparse';

type CsvRow = Record<string, string>;

type OutRow = CsvRow & {
  sessionId: string;
  unlockLink: string;
  error: string;
};

const PLACE_KEYS = ['place_id', 'placeId', 'Place_ID', 'kgmid'];
const NAME_KEYS = ['businessName', 'name', 'Business Name', 'Business'];
const ADDR_KEYS = ['address', 'Address', 'Full_Address', 'full_address'];
const SESSION_KEYS = ['sessionId', 'session_id'];
const KEYWORD_KEYS = ['keyword', 'searchKeyword', 'search_keyword'];

function pick(row: CsvRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function makeSessionId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function LinkBuilderPage() {
  const [baseUrl, setBaseUrl] = useState('https://orderchatpower.vercel.app');
  const [campaignKeyword, setCampaignKeyword] = useState('');
  const [includeRefresh, setIncludeRefresh] = useState(true);
  const [rows, setRows] = useState<OutRow[]>([]);
  const [message, setMessage] = useState('');

  const totals = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter((r) => r.unlockLink).length;
    return { total, ok, failed: total - ok };
  }, [rows]);

  const onFile = async (file: File) => {
    setMessage('Parsing CSV...');
    const text = await file.text();
    const parsed = Papa.parse<CsvRow>(text, {
      header: true,
      skipEmptyLines: true,
    });

    const out: OutRow[] = parsed.data.map((raw) => {
      const row: CsvRow = Object.fromEntries(
        Object.entries(raw ?? {}).map(([k, v]) => [k, (v ?? '').toString().trim()])
      );

      const businessName = pick(row, NAME_KEYS);
      const address = pick(row, ADDR_KEYS);
      const givenPlaceId = pick(row, PLACE_KEYS);
      const placeId = givenPlaceId || (businessName && address ? '/g/lookup' : '');
      const sessionId = pick(row, SESSION_KEYS) || makeSessionId();
      const keywordFromCsv = pick(row, KEYWORD_KEYS);
      const keyword = campaignKeyword.trim() || keywordFromCsv;

      if (!placeId) {
        return {
          ...row,
          sessionId,
          unlockLink: '',
          error: 'Missing place_id/placeId/kgmid and no name+address fallback.',
        };
      }

      const params = new URLSearchParams();
      params.set('place_id', placeId);
      params.set('sessionId', sessionId);
      if (businessName) params.set('name', businessName);
      if (address) params.set('address', address);
      if (keyword) params.set('keyword', keyword);
      if (includeRefresh) params.set('refresh', '1');

      return {
        ...row,
        sessionId,
        unlockLink: `${baseUrl.replace(/\/+$/, '')}/unlock?${params.toString()}`,
        error: '',
      };
    });

    setRows(out);
    setMessage(`Done. ${out.length} rows processed.`);
  };

  const downloadCsv = () => {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unlock-links.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Unlock Link Builder</h1>
        <p className="text-gray-400 text-sm">
          Upload CSV and generate Vercel unlock links that trigger competition, pricing, and concierge on the landing page.
        </p>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <label className="block text-sm text-gray-300">Base URL</label>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="https://orderchatpower.vercel.app"
          />

          <label className="block text-sm text-gray-300">Campaign Keyword (Optional)</label>
          <input
            value={campaignKeyword}
            onChange={(e) => setCampaignKeyword(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm"
            placeholder="pizza"
          />

          <label className="inline-flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={includeRefresh}
              onChange={(e) => setIncludeRefresh(e.target.checked)}
            />
            Add <code>refresh=1</code> to each link
          </label>

          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
            className="block w-full text-sm"
          />

          <div className="text-xs text-gray-400">
            Accepted columns: <code>place_id/placeId/Place_ID/kgmid</code>, <code>businessName/name</code>, <code>address/Full_Address</code>, optional <code>keyword</code>, optional <code>sessionId</code>.
          </div>
          <div className="text-xs text-gray-500">
            If Campaign Keyword is set, it is used for every row.
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <span>Total: {totals.total}</span>
          <span className="text-green-400">Links: {totals.ok}</span>
          <span className="text-red-400">Errors: {totals.failed}</span>
          {rows.length > 0 && (
            <button
              onClick={downloadCsv}
              className="ml-auto bg-indigo-600 hover:bg-indigo-500 rounded-lg px-4 py-2"
            >
              Download CSV
            </button>
          )}
        </div>

        {message && <div className="text-xs text-gray-400">{message}</div>}

        {rows.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-800">
                <tr>
                  <th className="text-left p-2">Business</th>
                  <th className="text-left p-2">Session</th>
                  <th className="text-left p-2">Unlock Link</th>
                  <th className="text-left p-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={i} className="border-t border-gray-800">
                    <td className="p-2">{pick(r, NAME_KEYS) || '-'}</td>
                    <td className="p-2">{r.sessionId}</td>
                    <td className="p-2 max-w-[580px] truncate">
                      {r.unlockLink ? (
                        <a className="text-cyan-300" href={r.unlockLink} target="_blank" rel="noreferrer">
                          {r.unlockLink}
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-2 text-red-300">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
