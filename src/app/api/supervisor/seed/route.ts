import { NextResponse } from 'next/server';
import { importLeads, type CsvRow } from '@/lib/importer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function splitLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseLeadFile(text: string): CsvRow[] {
  const cleaned = text.replace(/^\uFEFF/, '').trim();

  if (!cleaned) {
    return [];
  }

  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return [];
  }

  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = splitLine(lines[0], delimiter);

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i], delimiter);
    const row: Record<string, string> = {};

    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });

    rows.push(row as unknown as CsvRow);
  }

  return rows;
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file =
      formData.get('file') ||
      formData.get('csv') ||
      formData.get('leadFile') ||
      formData.get('upload');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'No file uploaded. Use form field name "file".' },
        { status: 400 }
      );
    }

    const text = await file.text();
    const rows = parseLeadFile(text);

    if (!rows.length) {
      return NextResponse.json(
        { error: 'Uploaded file is empty or could not be parsed.' },
        { status: 400 }
      );
    }

    const headers = Object.keys(rows[0] || {});
    const requiredColumns = ['businessName', 'contactName', 'Phone_1'];
    const missing = requiredColumns.filter((col) => !headers.includes(col));

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required columns: ${missing.join(', ')}`,
          headersReceived: headers,
        },
        { status: 400 }
      );
    }

    const result = await importLeads(rows);

    return NextResponse.json({
      ok: true,
      parsedRows: rows.length,
      imported: result.imported,
      duplicates: result.duplicates,
      errors: result.errors,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
