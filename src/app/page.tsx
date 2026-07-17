import Link from "next/link";
import { auth, enabledProviders } from "@/lib/auth";
import { SignInButtons } from "./signin-button";

const CONFIG_SNIPPET = `{
  "mcpServers": {
    "cron": {
      "url": "https://cron.regiq.in/api/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_KEY>"
      }
    }
  }
}`;

export default async function LandingPage() {
  const session = await auth().catch(() => null);
  const signedIn = !!session?.user;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-14">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-400" />
          Cron ⇒ webhook · MCP · streamable-http
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">cron-mcp</h1>
        <p className="mt-4 max-w-xl text-lg text-neutral-400">
          Schedule any prompt on any cron expression. When it fires, we POST to
          your callback URL. Your agent (Claude, Cursor, custom code) does the
          thinking — we just store schedules and fire webhooks. No LLM in our
          stack, no vendor lock-in.
        </p>
        <div className="mt-8">
          {signedIn ? (
            <div className="flex gap-3">
              <Link
                href="/dashboard"
                className="rounded-lg bg-teal-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-teal-400"
              >
                Open dashboard →
              </Link>
              <Link
                href="https://github.com/globalion/cron-mcp"
                target="_blank"
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-5 py-2.5 text-sm text-neutral-200 hover:bg-neutral-800"
              >
                GitHub ↗
              </Link>
            </div>
          ) : (
            <div className="max-w-sm">
              <SignInButtons providers={enabledProviders} />
              <Link
                href="https://github.com/globalion/cron-mcp"
                target="_blank"
                className="mt-2 block text-center text-xs text-neutral-500 underline hover:text-neutral-300"
              >
                View on GitHub ↗
              </Link>
            </div>
          )}
        </div>
      </div>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Mental model
        </h2>
        <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-300">
{`Your agent  →  schedule_job(cron, prompt, callback_url)
                            │
                            ▼
                   cron-mcp stores it
                            │
                    (cron matches at 8am)
                            │
                            ▼
     cron-mcp POSTs { jobId, name, prompt, metadata, firedAt }
     to your callback_url, signed with X-Cron-Signature
                            │
                            ▼
             Your callback runs the prompt through
             the LLM + tools and delivers the result.`}
        </pre>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Limits (per API key)
        </h2>
        <div className="grid grid-cols-1 gap-2 text-sm text-neutral-400 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-xs uppercase text-neutral-500">Jobs per user</div>
            <div className="mt-1 text-neutral-200">20 max</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-xs uppercase text-neutral-500">Fire interval</div>
            <div className="mt-1 text-neutral-200">5 min minimum</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <div className="text-xs uppercase text-neutral-500">Cost</div>
            <div className="mt-1 text-neutral-200">Free forever</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Fair-use caps to keep the free tier free. Building an aggregator platform
          that needs more? Email shreyas.pavuluri@gmail.com.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Setup
        </h2>
        <ol className="space-y-2 text-neutral-300">
          <li>1. Sign in above.</li>
          <li>2. Copy your MCP API key from the dashboard.</li>
          <li>3. Paste this into your agent&apos;s config:</li>
        </ol>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-200">
          {CONFIG_SNIPPET}
        </pre>
        <p className="mt-3 text-sm text-neutral-400">
          Then have your agent call{" "}
          <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">schedule_job</code>{" "}
          with a cron expression, prompt text, and the URL to POST to when it fires.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          MCP tools
        </h2>
        <ul className="space-y-1 text-sm text-neutral-400">
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">schedule_job(name, cron, prompt, callbackUrl, ...)</code> — create a job.</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">list_jobs()</code> — return everything you own.</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">get_job(id)</code> — one job + last 20 fire attempts.</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">update_job(id, ...)</code> — partial update, or pause via <code className="rounded bg-neutral-800 px-1.5 py-0.5">isActive: false</code>.</li>
          <li>• <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-teal-300">delete_job(id)</code> — permanent.</li>
        </ul>
      </section>

      <section className="mb-12">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Webhook payload
        </h2>
        <pre className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs leading-relaxed text-neutral-200">
{`POST <your callback_url>
Content-Type: application/json
X-Cron-Signature: sha256=<hex-hmac-of-body>

{
  "jobId":   "clx...",
  "name":    "daily AI news briefing",
  "prompt":  "summarise the top 5 AI news items from the last 24h",
  "metadata": { ... },
  "firedAt": "2026-07-16T08:00:00.412Z"
}`}
        </pre>
        <p className="mt-3 text-sm text-neutral-400">
          Verify the signature by re-hashing the raw body with your shared
          signing secret. Return any 2xx status to mark the fire as ok.
        </p>
      </section>

      <footer className="mt-16 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
        Built by{" "}
        <Link href="https://github.com/Shreyas-Profile" target="_blank" className="underline">
          Shreyas
        </Link>{" "}
        · Shipped by{" "}
        <Link href="https://github.com/globalion" target="_blank" className="underline">
          Globalion
        </Link>{" "}
        · MIT
      </footer>
    </main>
  );
}
