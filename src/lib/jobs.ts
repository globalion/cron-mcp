// Job CRUD + cron-expression handling. Called from the MCP route on
// tools/call and from the scheduler loop.
//
// nextFireAt is pre-computed on every write so the scheduler's "which jobs
// are due right now?" query is a single indexed range scan, no per-row
// cron-parse.

import { CronExpressionParser } from "cron-parser";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export interface ScheduleInput {
  name: string;
  cron: string;
  prompt: string;
  callbackUrl: string;
  callbackHeaders?: Record<string, string>;
  metadata?: Record<string, unknown>;
  timezone?: string;
}

export interface UpdateInput extends Partial<ScheduleInput> {
  isActive?: boolean;
}

/**
 * Validate a cron expression. Throws with a helpful message if invalid.
 * Returns the next fire timestamp.
 */
export function computeNextFire(cron: string, timezone: string, from: Date = new Date()): Date {
  try {
    const iter = CronExpressionParser.parse(cron, {
      currentDate: from,
      tz: timezone || "UTC",
    });
    return iter.next().toDate();
  } catch (err) {
    throw new Error(`Invalid cron expression '${cron}': ${(err as Error).message}`);
  }
}

// Hard caps that protect the fleet:
//   MAX_JOBS_PER_USER — one user can't hoard the scheduler tick budget
//   MIN_INTERVAL_MS   — a "* * * * *" style job would fire every minute
//     which can DDoS a callback URL. We reject anything faster than 5 min
//     between consecutive fires.
const MAX_JOBS_PER_USER = 20;
const MIN_INTERVAL_MS = 5 * 60 * 1000;

function assertMinInterval(cron: string, tz: string) {
  try {
    const iter = CronExpressionParser.parse(cron, { currentDate: new Date(), tz });
    const first = iter.next().toDate().getTime();
    const second = iter.next().toDate().getTime();
    if (second - first < MIN_INTERVAL_MS) {
      throw new Error(
        `Cron '${cron}' fires faster than every 5 minutes. Minimum interval is 5 min ` +
          `(so callbacks don't get hammered). Use a slower schedule.`,
      );
    }
  } catch (err) {
    if ((err as Error).message.startsWith("Cron '")) throw err;
    // Invalid-cron errors surface elsewhere; don't re-wrap here.
  }
}

export async function scheduleJob(userId: string, input: ScheduleInput) {
  const tz = input.timezone || "UTC";

  const activeCount = await prisma.job.count({ where: { userId } });
  if (activeCount >= MAX_JOBS_PER_USER) {
    throw new Error(
      `You already have ${activeCount} scheduled jobs (limit ${MAX_JOBS_PER_USER}). ` +
        `Delete some via delete_job before adding more.`,
    );
  }
  assertMinInterval(input.cron, tz);

  const nextFireAt = computeNextFire(input.cron, tz);
  const row = await prisma.job.create({
    data: {
      userId,
      name: input.name,
      cron: input.cron,
      prompt: input.prompt,
      callbackUrl: input.callbackUrl,
      callbackHeaders: (input.callbackHeaders ?? {}) as Prisma.InputJsonValue,
      metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      timezone: tz,
      nextFireAt,
    },
  });
  return { id: row.id, name: row.name, cron: row.cron, nextFireAt: row.nextFireAt };
}

export async function listJobs(userId: string) {
  const rows = await prisma.job.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      cron: true,
      prompt: true,
      callbackUrl: true,
      timezone: true,
      isActive: true,
      lastFiredAt: true,
      nextFireAt: true,
      createdAt: true,
    },
  });
  return { jobs: rows, count: rows.length };
}

export async function getJob(userId: string, id: string) {
  const row = await prisma.job.findFirst({
    where: { id, userId },
    include: {
      runs: {
        orderBy: { firedAt: "desc" },
        take: 20,
        select: { firedAt: true, statusCode: true, ok: true, errorMsg: true, durationMs: true },
      },
    },
  });
  if (!row) throw new Error(`Job ${id} not found (or not yours)`);
  return row;
}

export async function updateJob(userId: string, id: string, input: UpdateInput) {
  const existing = await prisma.job.findFirst({ where: { id, userId } });
  if (!existing) throw new Error(`Job ${id} not found (or not yours)`);
  const cron = input.cron ?? existing.cron;
  const tz = input.timezone ?? existing.timezone;
  const nextFireAt = computeNextFire(cron, tz);
  const row = await prisma.job.update({
    where: { id },
    data: {
      name: input.name ?? existing.name,
      cron,
      prompt: input.prompt ?? existing.prompt,
      callbackUrl: input.callbackUrl ?? existing.callbackUrl,
      callbackHeaders: (input.callbackHeaders ?? existing.callbackHeaders ?? {}) as Prisma.InputJsonValue,
      metadata: (input.metadata ?? existing.metadata ?? {}) as Prisma.InputJsonValue,
      timezone: tz,
      isActive: input.isActive ?? existing.isActive,
      nextFireAt,
    },
  });
  return { id: row.id, name: row.name, cron: row.cron, nextFireAt: row.nextFireAt, isActive: row.isActive };
}

export async function deleteJob(userId: string, id: string) {
  const existing = await prisma.job.findFirst({ where: { id, userId } });
  if (!existing) throw new Error(`Job ${id} not found (or not yours)`);
  await prisma.job.delete({ where: { id } });
  return { ok: true };
}
