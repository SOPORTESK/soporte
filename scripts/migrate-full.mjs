// Migración completa: crear schema + insertar datos en el nuevo proyecto
import fs from 'fs';

const OLD_URL = 'https://jwlavcjwuhdydmusqskx.supabase.co';
const OLD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bGF2Y2p3dWhkeWRtdXNxc2t4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTA4MzY5NywiZXhwIjoyMDkwNjU5Njk3fQ.241B55K2t9WssEBBCVcLN_VdU15SXV9Gs9sBrM71d3U';
const NEW_URL = 'https://syngvbgelcfyunjggpwo.supabase.co';
const NEW_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmd2YmdlbGNmeXVuamdncHdvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjcwOTI0MiwiZXhwIjoyMTAyMjI4NTI0Mn0.fdjmyVDzTXRhxfsweYiHH9RN5DN0q5CKSZ5EEBJumOw';

const TABLES = ['garantias_historial', 'registros', 'perfiles', 'garantias', 'inventario'];

async function fetchAll(url, key, table) {
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const res = await fetch(`${url}/rest/v1/${table}?select=*&offset=${offset}&limit=${limit}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error(`  Error fetching ${table}: ${res.status}`);
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

async function insertBatch(url, key, table, rows) {
  // Insertar en lotes de 500
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal,resolution=ignore-duplicates',
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`  Error inserting ${table} batch ${i}: ${res.status} ${errText.substring(0, 200)}`);
      // Intentar uno por uno
      for (const row of batch) {
        const r2 = await fetch(`${url}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal,resolution=ignore-duplicates',
          },
          body: JSON.stringify(row),
        });
        if (r2.ok) inserted++;
        else {
          const e2 = await r2.text();
          if (!e2.includes('duplicate')) console.error(`    Row error: ${e2.substring(0, 150)}`);
        }
      }
    } else {
      inserted += batch.length;
    }
  }
  return inserted;
}

async function main() {
  // 1. Extraer datos del viejo
  console.log('=== Extrayendo datos del proyecto viejo ===');
  const allData = {};
  for (const table of TABLES) {
    const rows = await fetchAll(OLD_URL, OLD_KEY, table);
    allData[table] = rows;
    console.log(`  ${table}: ${rows.length} rows`);
  }

  // 2. Generar SQL para crear las tablas (lo guardamos para que el usuario lo ejecute en el SQL Editor)
  let schemaSQL = '-- Ejecutar en el SQL Editor del nuevo proyecto\n\n';

  for (const table of TABLES) {
    const rows = allData[table];
    if (rows.length === 0) {
      // Sin datos, crear tabla básica
      schemaSQL += `CREATE TABLE IF NOT EXISTS ${table} (\n  id text PRIMARY KEY,\n  data jsonb\n);\n\n`;
      continue;
    }
    const columns = Object.keys(rows[0]);
    // Inferir tipos
    const colDefs = columns.map(col => {
      const sampleVal = rows.find(r => r[col] !== null && r[col] !== undefined)?.[col];
      let type = 'text';
      if (sampleVal !== undefined) {
        if (typeof sampleVal === 'boolean') type = 'boolean';
        else if (typeof sampleVal === 'number') type = Number.isInteger(sampleVal) ? 'integer' : 'numeric';
        else if (typeof sampleVal === 'object') type = 'jsonb';
        else if (typeof sampleVal === 'string') {
          if (/^\d{4}-\d{2}-\d{2}T/.test(sampleVal)) type = 'timestamptz';
          else if (/^\d{4}-\d{2}-\d{2}$/.test(sampleVal)) type = 'date';
        }
      }
      const isPK = col === 'id';
      return `  "${col}" ${type}${isPK ? ' PRIMARY KEY' : ''}`;
    });
    schemaSQL += `CREATE TABLE IF NOT EXISTS ${table} (\n${colDefs.join(',\n')}\n);\n\n`;
    // Habilitar RLS con policy de service_role
    schemaSQL += `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n`;
    schemaSQL += `CREATE POLICY "service_role all" ON ${table} FOR ALL TO service_role USING (true) WITH CHECK (true);\n\n`;
  }

  fs.writeFileSync('migration_schema.sql', schemaSQL);
  console.log('\nSchema SQL guardado en migration_schema.sql');
  console.log('\n=== EJECUTAR ESTO EN EL SQL EDITOR DEL NUEVO PROYECTO ===\n');
  console.log(schemaSQL);

  // 3. Intentar insertar datos via REST (funcionará si las tablas ya existen)
  console.log('\n=== Insertando datos en el nuevo proyecto ===');
  for (const table of TABLES) {
    const rows = allData[table];
    if (rows.length === 0) {
      console.log(`  ${table}: sin datos, saltando`);
      continue;
    }
    console.log(`  Insertando ${table} (${rows.length} rows)...`);
    const inserted = await insertBatch(NEW_URL, NEW_KEY, table, rows);
    console.log(`    Insertados: ${inserted}/${rows.length}`);
  }

  console.log('\n=== Migración completa ===');
  console.log('Si hubo errores de tablas no existentes, ejecutá migration_schema.sql en:');
  console.log('https://supabase.com/dashboard/project/syngvbgelcfyunjggpwo/sql/new');
  console.log('Y luego corré este script de nuevo.');
}

main().catch(e => console.error('Fatal:', e.message));
