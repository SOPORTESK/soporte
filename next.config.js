/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["pdf-parse", "tesseract.js", "ffmpeg-static", "fluent-ffmpeg", "active-win", "screenshot-desktop"],
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" }
    ]
  },
  async redirects() {
    return [
      // Rutas viejas redirigen al único widget oficial.
      { source: "/widget", destination: "/widget-standalone.html", permanent: true },
      { source: "/widget/:path*", destination: "/widget-standalone.html", permanent: true },
      { source: "/widget/chat", destination: "/widget-standalone.html", permanent: true },
    ];
  },
};
module.exports = nextConfig;
