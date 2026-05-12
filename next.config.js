/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" }
    ]
  },
  async redirects() {
    return [
      {
        source: "/widget-standalone.html",
        destination: "/widget/",
        permanent: true,
      },
    ];
  },
};
module.exports = nextConfig;
