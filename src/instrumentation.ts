// Runs once when a Next.js server instance starts.
// Starts the daily billing scheduler (Node.js runtime only; not during `next build`).
// The import stays inside the NEXT_RUNTIME check so the Edge bundle never includes it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startBillingScheduler } = await import("./lib/jobs/scheduler");
    startBillingScheduler();
  }
}
