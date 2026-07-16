// The cron scheduler loop.
//
// Started once per web-process by src/instrumentation.ts (Next.js's built-in
// startup hook). Runs every SCHEDULER_TICK_SECONDS, finds jobs where
// nextFireAt <= now AND isActive, fires each via HMAC-signed webhook POST,
// then advances lastFiredAt + recomputes nextFireAt.
//
// Concurrency: one node process = one loop. If you scale horizontally, use
// a Postgres advisory lock in tick() to prevent multiple firers.

import { createHmac } from "node:crypto";
import { prisma } from "./db";
import { computeNextFire } from "./jobs";

const TICK_SECONDS = Number(process.env.SCHEDULER_TICK_SECONDS ?? 60);
const SIGNING_SECRET = process.env.CRON_WEBHOOK_SIGNING_SECRET ?? "";
const CALLBACK_TIMEOUT_MS = 20_000;

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;
  console.log(`[scheduler] starting, tick=${TICK_SECONDS}s`);
  // Fire an immediate tick so tests don't have to wait 60s to see anything.
  tick().catch((err) => console.error("[scheduler] initial tick failed:", err));
  setInterval(() => {
    tick().catch((err) => console.error("[scheduler] tick failed:", err));
  }, TICK_SECONDS * 1000).unref();
}

async function tick() {
  const now = new Date();
  const due = await prisma.job.findMany({
    where: {
      isActive: true,
      nextFireAt: { lte: now },
    },
    take: 500,
  });
  if (due.length === 0) return;
  console.log(`[scheduler] tick @ ${now.toISOString()} — firing ${due.length} job(s)`);
  await Promise.allSettled(due.map(fireOne));
}

async function fireOne(job: {
  id: string;
  name: string;
  prompt: string;
  callbackUrl: string;
  callbackHeaders: unknown;
  metadata: unknown;
  cron: string;
  timezone: string;
}) {
  const firedAt = new Date();
  const body = JSON.stringify({
    jobId: job.id,
    name: job.name,
    prompt: job.prompt,
    metadata: job.metadata ?? {},
    firedAt: firedAt.toISOString(),
  });
  const signature = SIGNING_SECRET
    ? createHmac("sha256", SIGNING_SECRET).update(body).digest("hex")
    : "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "cron-mcp/0.1",
    ...(signature ? { "X-Cron-Signature": signature } : {}),
    ...((job.callbackHeaders as Record<string, string>) ?? {}),
  };

  const start = Date.now();
  let statusCode: number | null = null;
  let ok = false;
  let errorMsg: string | null = null;

  try {
    const res = await fetch(job.callbackUrl, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });
    statusCode = res.status;
    ok = res.ok;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      errorMsg = `HTTP ${res.status}: ${text.slice(0, 500)}`;
    }
  } catch (err) {
    errorMsg = (err as Error).message;
  }
  const durationMs = Date.now() - start;

  // Advance the schedule regardless of callback success — a failing callback
  // shouldn't stop future runs. Users can inspect JobRun rows to diagnose.
  const nextFireAt = computeNextFire(job.cron, job.timezone, firedAt);
  await prisma.$transaction([
    prisma.job.update({
      where: { id: job.id },
      data: { lastFiredAt: firedAt, nextFireAt },
    }),
    prisma.jobRun.create({
      data: {
        jobId: job.id,
        firedAt,
        statusCode,
        ok,
        errorMsg,
        durationMs,
      },
    }),
  ]);

  if (!ok) {
    console.warn(`[scheduler] job ${job.id} (${job.name}) callback failed: ${errorMsg}`);
  }
}
