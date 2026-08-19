import fs from 'fs';

const OLD_URL = 'https://jwlavcjwuhdydmusqskx.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bGF2Y2p3dWhkeWRtdXNxc2t4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA4MzY5NywiZXhwIjoyMDkwNjU5Njk3fQ.241B55K2t9WssEBBCVcLN_VdU15SXV9Gs9sBrM71d3U';

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return "'" + JSON.stringify(v).replace(/'/g, "''") + "'";
  return "'" + String(v).replace(/'/g, "''").replace(/\n/g, ' ') + "'";
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

async function main() {
  // garantias
  const garantias = await fetchAll('garantias');
  const gCols = Object.keys(garantias[0]);
  let gSql = `DELETE FROM garantias;\nINSERT INTO garantias (${gCols.join(', ')}) VALUES\n`;
  const gVals = garantias.map(row => `  (${gCols.map(c => esc(row[c])).join(', ')})`);
  gSql += gVals.join(',\n') + ';\n';
  fs.writeFileSync('insert_garantias_compact.sql', gSql);
  console.log(`garantias: ${garantias.length} rows, ${gSql.length} chars`);

  // inventario - split in 3 parts
  const inv = await fetchAll('inventario');
  const iCols = Object.keys(inv[0]);
  const partSize = 1000;
  for (let i = 0; i < inv.length; i += partSize) {
    const part = inv.slice(i, i + partSize);
    let iSql = `INSERT INTO inventario (${iCols.join(', ')}) VALUES\n`;
    const iVals = part.map(row => `  (${iCols.map(c => esc(row[c])).join(', ')})`);
    iSql += iVals.join(',\n') + ';\n';
    const partNum = Math.floor(i / partSize) + 1;
    fs.writeFileSync(`insert_inventario_part${partNum}.sql`, iSql);
    console.log(`inventario part ${partNum}: ${part.length} rows, ${iSql.length} chars`);
  }
}

main().catch(e => console.error('Fatal:', e.message));
