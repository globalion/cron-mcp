// Job CRUD + cron-expression handling. Called from the MCP route on
// tools/call and from the scheduler loop.
//
// nextFireAt is pre-computed on every write so the scheduler's "which jobs
// are due right now?" query is a single indexed range scan, no per-row
// cron-parse.

import { CronExpressionParser } from "cron-parser";
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

export async function scheduleJob(userId: string, input: ScheduleInput) {
  const tz = input.timezone || "UTC";
  const nextFireAt = computeNextFire(input.cron, tz);
  const row = await prisma.job.create({
    data: {
      userId,
      name: input.name,
      cron: input.cron,
      prompt: input.prompt,
      callbackUrl: input.callbackUrl,
      callbackHeaders: input.callbackHeaders ?? {},
      metadata: input.metadata ?? {},
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
      callbackHeaders: input.callbackHeaders ?? (existing.callbackHeaders as Record<string, string>),
      metadata: input.metadata ?? (existing.metadata as Record<string, unknown>),
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
