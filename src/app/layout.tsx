import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { SplashScreen } from "@/components/splash-screen";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Chat Sekunet - Atención al cliente",
  description: "Plataforma premium de atención al cliente con chat omnicanal",
  icons: { icon: "/icon-app-512.png", apple: "/icon-app-512.png" },
  manifest: "/manifest-app.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Chat Sekunet",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1d4ed8" },
    { media: "(prefers-color-scheme: dark)",  color: "#0b1220" }
  ],
  viewportFit: "cover" as const,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.variable}>
      <head>
        <link rel="apple-touch-icon" href="/icon-app-512.png" />
      </head>
      <body className="font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-brand-700 focus:text-white focus:px-4 focus:py-2 focus:rounded-md">
          Saltar al contenido
        </a>
        <ThemeProvider>
          <SplashScreen />
          {children}
          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
if('serviceWorker' in navigator){
  navigator.serviceWorker.getRegistrations().then(function(regs){
    regs.forEach(function(r){
      if(r.active && r.active.scriptURL && !r.active.scriptURL.endsWith('/sw-app.js')){
        r.unregister();
      }
    });
  });
  caches.keys().then(function(names){
    names.forEach(function(n){
      if(n.indexOf('sekunet-app')===-1) caches.delete(n);
    });
  });
  navigator.serviceWorker.register('/sw-app.js').catch(function(){});
}`,
          }}
        />
      </body>
    </html>
  );
}
