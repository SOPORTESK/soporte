const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
c.connect().then(async () => {
  const r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='evolution_api' ORDER BY table_name");
  console.log('Tablas en schema evolution_api:', r.rows.length);
  for (const row of r.rows) {
    try {
      const count = await c.query('SELECT count(*) FROM evolution_api.' + row.table_name);
      console.log('  ', row.table_name, count.rows[0].count);
    } catch (e) {
      console.log('  ', row.table_name, '(error: ' + e.message + ')');
    }
  }
  await c.end();
}).catch(e => { console.log('ERROR:', e.message); });
