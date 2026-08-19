// Script para extraer todos los datos del proyecto viejo y guardarlos en SQL
import fs from 'fs';
const SUPABASE_URL = 'https://jwlavcjwuhdydmusqskx.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bGF2Y2p3dWhkeWRtdXNxc2t4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA4MzY5NywiZXhwIjoyMDkwNjU5Njk3fQ.241B55K2t9WssEBBCVcLN_VdU15SXV9Gs9sBrM71d3U';

const TABLES = ['garantias_historial', 'registros', 'perfiles', 'garantias', 'inventario'];

async function fetchAll(table) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&offset=${offset}&limit=${limit}`, {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
    });
    if (!res.ok) {
      console.error(`Error fetching ${table}: ${res.status} ${await res.text()}`);
      break;
    }
    const rows = await res.json();
    if (!rows || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

function escapeValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`;
  // string
  return `'${String(val).replace(/'/g, "''")}'`;
}

function rowsToInsert(table, rows) {
  if (!rows.length) return `-- ${table}: no data\n`;
  const columns = Object.keys(rows[0]);
  let sql = `-- Table: ${table} (${rows.length} rows)\n`;
  sql += `DELETE FROM ${table};\n`;
  for (const row of rows) {
    const values = columns.map(c => escapeValue(row[c])).join(', ');
    sql += `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values});\n`;
  }
  return sql + '\n';
}

async function main() {
  let out = `-- Migration dump from jwlavcjwuhdydmusqskx\n-- Generated: ${new Date().toISOString()}\n\n`;

  for (const table of TABLES) {
    console.log(`Fetching ${table}...`);
    const rows = await fetchAll(table);
    console.log(`  ${rows.length} rows`);
    out += rowsToInsert(table, rows);
  }

  fs.writeFileSync('migration_dump.sql', out);
  console.log('\nDone! Saved to migration_dump.sql');
}

main().catch(e => console.error('Fatal:', e.message));
