import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentKeyPrefix } from "@/lib/keys";
import { KeyPanel } from "./key-panel";

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const sp = await searchParams;
  const rawKey = typeof sp.freshKey === "string" ? sp.freshKey : null;

  const [prefix, jobs] = await Promise.all([
    getCurrentKeyPrefix(session.user.id),
    prisma.job.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        runs: { take: 1, orderBy: { firedAt: "desc" }, select: { firedAt: true, ok: true } },
      },
    }),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your cron-mcp dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">Signed in as {session.user.email}</p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          1. MCP API key
        </h2>
        <KeyPanel initialPrefix={prefix} freshKey={rawKey} />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">
          2. Scheduled jobs{" "}
          <span className="text-neutral-600 normal-case">
            — {jobs.length === 0 ? "none yet, create via MCP" : `${jobs.length} total`}
          </span>
        </h2>
        {jobs.length === 0 ? (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-5 text-sm text-neutral-400">
            No jobs yet. Once your agent calls{" "}
            <code className="rounded bg-black/40 px-1.5 py-0.5 text-teal-300">schedule_job</code>{" "}
            they appear here.
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((j) => (
              <div
                key={j.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-neutral-100">{j.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      <span>
                        <code className="rounded bg-black/40 px-1 py-0.5 text-teal-300">{j.cron}</code>{" "}
                        · {j.timezone}
                      </span>
                      <span>{j.isActive ? "active" : "paused"}</span>
                      {j.nextFireAt && (
                        <span>next: {new Date(j.nextFireAt).toISOString().slice(0, 16).replace("T", " ")}</span>
                      )}
                      {j.runs[0] && (
                        <span>
                          last: {new Date(j.runs[0].firedAt).toISOString().slice(0, 16).replace("T", " ")}{" "}
                          {j.runs[0].ok ? "✓" : "✗"}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs text-neutral-400">
                      → {j.callbackUrl}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Claude Desktop config
        </div>
        <pre className="overflow-x-auto rounded bg-black/40 p-3 text-xs text-neutral-200">
{`{
  "mcpServers": {
    "cron": {
      "url": "https://cron.regiq.in/api/mcp",
      "headers": {
        "Authorization": "Bearer <PASTE_YOUR_KEY>"
      }
    }
  }
}`}
        </pre>
        <p className="mt-3 text-xs text-neutral-500">
          <Link href="/" className="underline">← Back to overview</Link>
        </p>
      </section>
    </main>
  );
}
