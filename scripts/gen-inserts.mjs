import fs from 'fs';

const OLD_URL = 'https://jwlavcjwuhdydmusqskx.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bGF2Y2p3dWhkeWRtdXNxc2t4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA4MzY5NywiZXhwIjoyMDkwNjU5Njk3fQ.241B55K2t9WssEBBCVcLN_VdU15SXV9Gs9sBrM71d3U';

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function fetchAll(table) {
  const all = [];
  let offset = 0;
  while (true) {
    const res = await fetch(`${OLD_URL}/rest/v1/${table}?select=*&offset=${offset}&limit=1000`, {
      headers: { apikey: OLD_KEY, Authorization: `Bearer ${OLD_KEY}` },
    });
    const rows = await res.json();
    if (!rows || rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return all;
}

async function dumpTable(table) {
  const rows = await fetchAll(table);
  if (rows.length === 0) return `-- ${table}: no data\n`;
  const cols = Object.keys(rows[0]);
  let sql = `DELETE FROM ${table};\n`;
  for (const row of rows) {
    const vals = cols.map(c => esc(row[c])).join(', ');
    sql += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals});\n`;
  }
  return sql + '\n';
}

async function main() {
  const tables = ['perfiles', 'garantias_historial', 'garantias', 'inventario'];
  let allSQL = '';
  for (const t of tables) {
    console.log(`Dumping ${t}...`);
    allSQL += await dumpTable(t);
  }
  fs.writeFileSync('insert_all.sql', allSQL);
  console.log(`Done! insert_all.sql (${allSQL.split('\n').length} lines)`);
}

main().catch(e => console.error('Fatal:', e.message));
