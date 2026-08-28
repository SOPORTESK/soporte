// Medir latencia de Supabase Auth
const URL = "https://kzcyxeracvfxynddyjld.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTE5NTQsImV4cCI6MjA5MTA4Nzk1NH0.DvEnK-g5rMxzFec4Fl3rJ5VDYVJ7-ua9ssqf3s-QKtU";

async function measure(label, fn) {
  const start = Date.now();
  try {
    const r = await fn();
    console.log(`${label}: ${Date.now() - start}ms — ${r}`);
  } catch (e) {
    console.log(`${label}: ${Date.now() - start}ms — ERROR: ${e.message}`);
  }
}

// 1. Health
measure("auth health", () =>
  fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON } })
    .then(r => r.text()).then(t => t.slice(0, 60))
);

// 2. getUser sin token (debería responder rápido con user:null)
measure("getUser sin token", () =>
  fetch(`${URL}/auth/v1/user`, { headers: { apikey: ANON } })
    .then(r => `${r.status}`)
);

// 3. Rest API simple
measure("rest sek_cases count", () =>
  fetch(`${URL}/rest/v1/sek_cases?select=id&limit=1`, { headers: { apikey: ANON } })
    .then(r => `${r.status}`)
);

// 4. Múltiples getUser en paralelo (simular middleware concurrente)
Promise.all([
  measure("getUser #1", () => fetch(`${URL}/auth/v1/user`, { headers: { apikey: ANON } }).then(r => `${r.status}`)),
  measure("getUser #2", () => fetch(`${URL}/auth/v1/user`, { headers: { apikey: ANON } }).then(r => `${r.status}`)),
  measure("getUser #3", () => fetch(`${URL}/auth/v1/user`, { headers: { apikey: ANON } }).then(r => `${r.status}`)),
]);
