// Extrae el schema del proyecto viejo y lo aplica al nuevo
import fs from 'fs';

const OLD_URL = 'https://jwlavcjwuhdydmusqskx.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bGF2Y2p3dWhkeWRtdXNxc2t4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA4MzY5NywiZXhwIjoyMDkwNjU5Njk3fQ.241B55K2t9WssEBBCVcLN_VdU15SXV9Gs9sBrM71d3U';
const NEW_URL = 'https://syngvbgelcfyunjggpwo.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmd2YmdlbGNmeXVuamdncHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjcwOTI0MiwiZXhwIjoyMTAyMjI4NTI0Mn0.fdjmyVDzTXRhxfsweYiHH9RN5DN0q5CKSZ5EEBJumOw';

const TABLES = ['garantias_historial', 'registros', 'perfiles', 'garantias', 'inventario'];

async function getTableSchema(table) {
  // Obtener columnas via RPC
  const res = await fetch(`${OLD_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: { apikey: OLD_KEY, Authorization: `Bearer ${OLD_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length FROM information_schema.columns WHERE table_name='${table}' AND table_schema='public' ORDER BY ordinal_position` }),
  });
  if (!res.ok) return null;
  return await res.json();
}

// Como no tenemos exec_sql, usamos PostgREST para inferir el schema desde los datos
async function inferSchemaFromData(table) {
  const res = await fetch(`${OLD_URL}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: OLD_KEY, Authorization: `Bearer ${OLD_KEY}` },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows || rows.length === 0) return null;
  return Object.keys(rows[0]);
}

async function fetchAll(url, key, table) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&offset=${offset}&limit=${limit}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) break;
    const rows = await res.json();
    if (!rows || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

function inferColumnType(val, key) {
  if (val === null || val === undefined) return 'text';
  if (typeof val === 'boolean') return 'boolean';
  if (typeof val === 'number') return Number.isInteger(val) ? 'integer' : 'numeric';
  if (typeof val === 'object') return 'jsonb';
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return 'timestamptz';
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'date';
    if (key === 'id' || key.endsWith('_id')) return 'text';
    return 'text';
  }
  return 'text';
}

function generateCreateTable(table, sampleRow) {
  const columns = Object.entries(sampleRow).map(([key, val]) => {
    let type = inferColumnType(val, key);
    let constraints = '';
    if (key === 'id') constraints = ' PRIMARY KEY';
    return `  ${key} ${type}${constraints}`;
  });
  return `CREATE TABLE IF NOT EXISTS ${table} (\n${columns.join(',\n')}\n);`;
}

async function main() {
  // 1. Inferir schema desde los datos
  console.log('=== Extrayendo schema ===');
  let schemaSQL = '';
  
  for (const table of TABLES) {
    const rows = await fetchAll(OLD_URL, OLD_KEY, table);
    console.log(`${table}: ${rows.length} rows`);
    if (rows.length > 0) {
      schemaSQL += generateCreateTable(table, rows[0]) + '\n\n';
    } else {
      // Sin datos, intentar inferir columnas
      const cols = await inferSchemaFromData(table);
      if (cols) {
        schemaSQL += `CREATE TABLE IF NOT EXISTS ${table} (\n  ${cols.map(c => `  ${c} text`).join(',\n')}\n);\n\n`;
      }
    }
  }

  fs.writeFileSync('migration_schema.sql', schemaSQL);
  console.log('\nSchema guardado en migration_schema.sql');
  console.log('\n=== Schema SQL ===');
  console.log(schemaSQL);
}

main().catch(e => console.error('Fatal:', e.message));
