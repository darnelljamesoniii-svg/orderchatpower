import { NextRequest, NextResponse } from 'next/server';
import { importLeads, type CsvRow } from '@/lib/importer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: CsvRow[] } = await req.json();

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows array is required' }, { status: 400 });
    }

    if (rows.length > 5000) {
      return NextResponse.json({ error: 'Max 5000 rows per import' }, { status: 400 });
    }

    const result = await importLeads(rows);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[/api/leads/import]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
