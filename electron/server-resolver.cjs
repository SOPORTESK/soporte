// ─── RESOLVER DE SERVIDOR ACTIVO PARA ELECTRON ───────────────────────────────
// Consulta la URL activa publicada en Supabase por la PC servidor de Sekunet.
const fs = require('fs');
const path = require('path');
try {
  const dns = require('dns');
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder('ipv4first');
} catch {}

const SUPABASE_URL = 'https://kzcyxeracvfxynddyjld.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6Y3l4ZXJhY3ZmeHluZGR5amxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTE5NTQsImV4cCI6MjA5MTA4Nzk1NH0.DvEnK-g5rMxzFec4Fl3rJ5VDYVJ7-ua9ssqf3s-QKtU';

const MEMORY_CACHE_TTL_MS = 30_000;
let _cachedUrl = null;
let _cachedLanUrl = null;
let _cachedAt = 0;

function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+/i.test(trimmed)) return null;
  return trimmed;
}

function getCacheFilePath() {
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'last-server-url.json');
    }
  } catch {}
  return null;
}

function readDiskCache() {
  try {
    const fp = getCacheFilePath();
    if (!fp || !fs.existsSync(fp)) return { url: null, lanUrl: null };
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return {
      url: normalizeUrl(parsed?.url),
      lanUrl: normalizeUrl(parsed?.lanUrl),
    };
  } catch {
    return { url: null, lanUrl: null };
  }
}

function readDiskCachedUrl() {
  return readDiskCache().url;
}

function writeDiskCachedUrl(url, lanUrl = _cachedLanUrl) {
  try {
    const clean = normalizeUrl(url);
    const cleanLan = normalizeUrl(lanUrl);
    const fp = getCacheFilePath();
    if ((!clean && !cleanLan) || !fp) return;
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(
      fp,
      JSON.stringify({ url: clean, lanUrl: cleanLan, savedAt: new Date().toISOString() }),
      'utf8'
    );
  } catch {}
}

function getCachedServerUrl() {
  return _cachedUrl || readDiskCachedUrl();
}

function setCachedServerUrl(url, lanUrl = _cachedLanUrl) {
  const clean = normalizeUrl(url);
  const cleanLan = normalizeUrl(lanUrl);
  if (clean) _cachedUrl = clean;
  if (cleanLan) _cachedLanUrl = cleanLan;
  if (clean || cleanLan) {
    _cachedAt = Date.now();
    writeDiskCachedUrl(clean || _cachedUrl, cleanLan || _cachedLanUrl);
  }
}

async function probeServer(baseUrl, timeoutMs = 5000) {
  const clean = normalizeUrl(baseUrl);
  if (!clean) return false;
  try {
    const res = await fetch(`${clean}/login`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

async function fetchConfiguredServerFromSupabase() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/sek_app_settings?key=eq.active_app_server&select=value`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return { url: null, lanUrl: null };
    const rows = await res.json();
    const rawVal = rows?.[0]?.value;
    if (!rawVal) return { url: null, lanUrl: null };
    const parsed = typeof rawVal === 'string' ? JSON.parse(rawVal) : rawVal;
    return {
      url: normalizeUrl(parsed?.url),
      lanUrl: normalizeUrl(parsed?.lanUrl),
    };
  } catch {
    return { url: null, lanUrl: null };
  }
}

async function resolveActiveServerUrl({ forceRefresh = false } = {}) {
  if (!forceRefresh && _cachedUrl && Date.now() - _cachedAt < MEMORY_CACHE_TTL_MS) {
    return _cachedUrl;
  }

  const cfg = await fetchConfiguredServerFromSupabase();
  if (cfg?.lanUrl) _cachedLanUrl = cfg.lanUrl;

  if (cfg?.url && (await probeServer(cfg.url, 4500))) {
    setCachedServerUrl(cfg.url, cfg.lanUrl);
    return cfg.url;
  }

  if (cfg?.lanUrl && (await probeServer(cfg.lanUrl, 2000))) {
    setCachedServerUrl(cfg.lanUrl, cfg.lanUrl);
    return cfg.lanUrl;
  }

  const disk = readDiskCache();
  if (disk.lanUrl && !_cachedLanUrl) _cachedLanUrl = disk.lanUrl;
  if (disk.url && disk.url !== cfg?.url && (await probeServer(disk.url, 3000))) {
    setCachedServerUrl(disk.url, cfg?.lanUrl || disk.lanUrl);
    return disk.url;
  }

  if (await probeServer('http://localhost:3100', 1500)) {
    _cachedUrl = 'http://localhost:3100';
    _cachedAt = Date.now();
    return 'http://localhost:3100';
  }

  const fallback = cfg?.url || cfg?.lanUrl || disk.url || 'http://localhost:3100';
  _cachedUrl = fallback;
  _cachedAt = Date.now();
  return fallback;
}

function isAppOrigin(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') return false;
  try {
    const u = new URL(targetUrl);
    const disk = readDiskCache();
    for (const candidate of [getCachedServerUrl(), _cachedLanUrl, disk.lanUrl]) {
      if (candidate) {
        const c = new URL(candidate);
        if (u.origin === c.origin) return true;
      }
    }
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    if (/\.trycloudflare\.com$/i.test(u.hostname) && u.protocol === 'https:') return true;
  } catch {}
  return false;
}

module.exports = {
  resolveActiveServerUrl,
  getCachedServerUrl,
  setCachedServerUrl,
  probeServer,
  fetchConfiguredServerFromSupabase,
  isAppOrigin,
};
