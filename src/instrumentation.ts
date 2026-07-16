// Next.js runs this file once per server process at startup. We use it to
// kick off the scheduler loop so the fire-webhooks logic runs whether or
// not any HTTP request has come in yet.
//
// Skips in the Edge runtime (register() is called there too) — the
// scheduler needs Node's setInterval + Prisma client.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("./lib/scheduler");
  startScheduler();
}
