const g = globalThis as unknown as { __sekDnsBoosted?: boolean };

if (typeof window === "undefined" && !g.__sekDnsBoosted) {
  try {
    const req = eval("require");
    const dns = req("dns");
    if (dns && typeof dns.lookup === "function") {
      g.__sekDnsBoosted = true;
      try {
        if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
      } catch {}

      const origLookup = dns.lookup.bind(dns);
      const dnsCache = new Map<string, { addresses: Array<{ address: string; family: number }>; ts: number }>();
      const CACHE_TTL_MS = 10 * 60 * 1000;

      const SUPABASE_FALLBACK_IPS = [
        { address: "172.64.149.246", family: 4 },
        { address: "104.18.38.10", family: 4 },
      ];

      const deliverResult = (
        addrs: Array<{ address: string; family: number }>,
        options: any,
        callback: Function
      ) => {
        const wantAll = typeof options === "object" && options !== null && Boolean(options.all);
        if (wantAll) {
          process.nextTick(() => callback(null, addrs));
        } else {
          const first = addrs[0] || SUPABASE_FALLBACK_IPS[0];
          process.nextTick(() => callback(null, first.address, first.family));
        }
      };

      dns.lookup = function patchedLookup(hostname: string, options: any, callback?: any) {
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

        origLookup(hostname, { ...(typeof opts === "object" ? opts : {}), all: true, family: 4 }, (err: any, res: any) => {
          if (!err && Array.isArray(res) && res.length > 0) {
            const mapped = res.map((r: any) => ({ address: r.address, family: r.family || 4 }));
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
  } catch {}
}

export {};
