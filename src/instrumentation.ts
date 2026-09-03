export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Evitar iniciar cron jobs o timers durante el proceso de build de Next.js / Vercel
    if (process.env.NEXT_PHASE === "phase-production-build" || process.env.VERCEL === "1") {
      return;
    }
    try {
      const { startLocalCronJobs } = await import("./lib/cron-bridge");
      startLocalCronJobs();
    } catch (e: any) {
      console.error("[instrumentation] Error starting local cron jobs:", e.message);
    }
  }
}
