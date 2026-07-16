// MCP tools exposed by /api/mcp for cron-mcp.
//
// Bridge pattern: we store schedules + fire webhooks; we do no inference and
// hold no LLM key. The caller's agent supplies both the prompt to fire and
// the callback URL that will handle the fire (typically the agent's own
// server, or Zapier / n8n / whatever).

import { z } from "zod";

// Obvious-garbage filter — 5-field cron or @-shortcut. Runtime parse happens
// inside the tool anyway, this just gives the LLM a hint.
const CRON_HINT = /^(@(hourly|daily|weekly|monthly|yearly|annually|midnight|reboot)|(\S+\s+){4}\S+)$/;

export const TOOL_DEFINITIONS = [
  {
    name: "schedule_job",
    description:
      "Create a scheduled prompt. When the cron expression matches, cron-mcp POSTs { jobId, name, prompt, metadata, firedAt } to your callback URL (signed with X-Cron-Signature). Use for daily briefings, hourly polls, weekly digests — anything that repeats on a fixed schedule. For one-shot 'in 3 minutes' notifications use a reminder skill instead; cron is for recurring work.",
    inputSchema: z.object({
      name: z
        .string()
        .min(1)
        .max(120)
        .describe("Human-readable label, e.g. 'daily AI news briefing'."),
      cron: z
        .string()
        .min(1)
        .regex(CRON_HINT, "Must be a 5-field cron expression or @hourly/@daily/etc.")
        .describe(
          "Standard 5-field cron 'min hour day month weekday' (e.g. '0 8 * * *' = every day at 08:00). Timezone defaults to UTC unless `timezone` is set.",
        ),
      prompt: z
        .string()
        .min(1)
        .max(4000)
        .describe(
          "Verbatim prompt your agent will receive when the job fires — e.g. 'summarise the top 5 AI news items from the last 24h and reply with a 3-bullet digest'.",
        ),
      callbackUrl: z
        .string()
        .url()
        .describe(
          "HTTPS URL cron-mcp POSTs to when the job fires. Body: { jobId, name, prompt, metadata, firedAt }. Verify by re-hashing the raw body with the shared signing secret and comparing to X-Cron-Signature.",
        ),
      callbackHeaders: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Extra HTTP headers to include on every callback (e.g. { 'X-Tenant': 'acme' }). Don't put secrets here in plaintext — use the signature-verified body for trust.",
        ),
      metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          "Opaque JSON echoed back to the callback. Useful for stamping an internal userId or channel tag on the job.",
        ),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone (e.g. 'Europe/London', 'America/New_York'). Cron matches minutes in this zone. Default: UTC.",
        ),
    }),
  },
  {
    name: "list_jobs",
    description: "Return all cron jobs owned by the calling API key, active and paused.",
    inputSchema: z.object({}),
  },
  {
    name: "get_job",
    description: "Return one job by id, plus its most recent 20 fire attempts (audit log).",
    inputSchema: z.object({
      id: z.string(),
    }),
  },
  {
    name: "update_job",
    description:
      "Modify an existing job. Pass only the fields you want to change; unspecified fields are preserved. Set `isActive: false` to pause without deleting.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1).max(120).optional(),
      cron: z.string().regex(CRON_HINT).optional(),
      prompt: z.string().min(1).max(4000).optional(),
      callbackUrl: z.string().url().optional(),
      callbackHeaders: z.record(z.string(), z.string()).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      timezone: z.string().optional(),
      isActive: z.boolean().optional(),
    }),
  },
  {
    name: "delete_job",
    description:
      "Permanently delete a job and all its run history. Prefer pausing (update_job.isActive=false) if you might revive it.",
    inputSchema: z.object({
      id: z.string(),
    }),
  },
] as const;

export type ToolName = (typeof TOOL_DEFINITIONS)[number]["name"];

export function findTool(name: string) {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

export function jsonSchemaFor(name: ToolName) {
  const t = findTool(name);
  if (!t) throw new Error(`unknown tool: ${name}`);
  return zodToJsonSchema(t.inputSchema);
}

// Minimal Zod → JSON Schema. Only handles the shapes used above.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function zodToJsonSchema(schema: z.ZodTypeAny): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as unknown as { _def: any })._def;
  const description = (schema as unknown as { description?: string }).description;
  const wrap = (v: Record<string, unknown>) => (description ? { ...v, description } : v);
  switch (def.typeName) {
    case "ZodString":
      return wrap({ type: "string" });
    case "ZodNumber":
      return wrap({ type: "number" });
    case "ZodBoolean":
      return wrap({ type: "boolean" });
    case "ZodArray":
      return wrap({ type: "array", items: zodToJsonSchema(def.type) });
    case "ZodOptional":
      return zodToJsonSchema(def.innerType);
    case "ZodDefault": {
      const inner = zodToJsonSchema(def.innerType);
      inner.default = def.defaultValue();
      return inner;
    }
    case "ZodRecord":
      return wrap({ type: "object", additionalProperties: true });
    case "ZodUnknown":
      return wrap({});
    case "ZodObject": {
      const shape = def.shape();
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape) as [string, z.ZodTypeAny][]) {
        props[k] = zodToJsonSchema(v);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vDef = (v as unknown as { _def: any })._def;
        if (vDef.typeName !== "ZodOptional" && vDef.typeName !== "ZodDefault") {
          required.push(k);
        }
      }
      return wrap({
        type: "object",
        properties: props,
        ...(required.length ? { required } : {}),
      });
    }
    default:
      return wrap({});
  }
}
