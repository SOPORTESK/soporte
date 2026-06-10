export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startLocalCronJobs } = await import("./lib/cron-bridge");
      startLocalCronJobs();
    } catch (e: any) {
      console.error("[instrumentation] Error starting local cron jobs:", e.message);
    }
  }
}
