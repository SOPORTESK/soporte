const dns = require("dns");

if (!global.__sekDnsBoosted && dns && typeof dns.lookup === "function") {
  global.__sekDnsBoosted = true;
  try {
    if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
  } catch {}

  const origLookup = dns.lookup.bind(dns);
  const dnsCache = new Map();
  const CACHE_TTL_MS = 10 * 60 * 1000;

  const SUPABASE_FALLBACK_IPS = [
    { address: "172.64.149.246", family: 4 },
    { address: "104.18.38.10", family: 4 },
  ];

  const deliverResult = (addrs, options, callback) => {
    const wantAll = typeof options === "object" && options !== null && Boolean(options.all);
    if (wantAll) {
      process.nextTick(() => callback(null, addrs));
    } else {
      const first = addrs[0] || SUPABASE_FALLBACK_IPS[0];
      process.nextTick(() => callback(null, first.address, first.family));
    }
  };

  dns.lookup = function patchedLookup(hostname, options, callback) {
    let cb = callback;
    let opts = options;
    if (typeof options === "function") {
      cb = options;
      opts = {};
    }
    if (typeof cb !== "function") {
      return origLookup(hostname, options, callback);
    }

    const host = String(hostname || "").toLowerCase().trim();
    const isSupabase = host.endsWith(".supabase.co");

    const cached = dnsCache.get(host);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return deliverResult(cached.addresses, opts, cb);
    }

    origLookup(hostname, Object.assign({}, typeof opts === "object" ? opts : {}, { all: true, family: 4 }), (err, res) => {
      if (!err && Array.isArray(res) && res.length > 0) {
        const mapped = res.map((r) => ({ address: r.address, family: r.family || 4 }));
        dnsCache.set(host, { addresses: mapped, ts: Date.now() });
        return deliverResult(mapped, opts, cb);
      }
      if (cached) {
        return deliverResult(cached.addresses, opts, cb);
      }
      if (isSupabase) {
        return deliverResult(SUPABASE_FALLBACK_IPS, opts, cb);
      }
      return origLookup(hostname, opts, cb);
    });
  };
}
