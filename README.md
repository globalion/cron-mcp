# cron-mcp

> Built by [**Shreyas**](https://github.com/Shreyas-Profile) · Shipped by [**Globalion**](https://github.com/globalion)

**Cron-as-a-service MCP. Schedule any prompt on any cron expression; when it fires we POST the job to your callback URL. No LLM in our stack.**

Your agent (Claude Desktop, Cursor, a custom script) does the thinking. We just:
- store the schedule + prompt + your callback URL
- match minutes against the cron expression
- POST the job body to your callback, signed with `X-Cron-Signature`

That's it. Perfect for daily briefings, hourly polls, weekly digests, or anything else that repeats on a fixed schedule and needs to run through an LLM.

Hosted at **[cron.regiq.in](https://cron.regiq.in)** or self-host with the Docker Compose below.

## Use it (hosted)

1. Visit https://cron.regiq.in, sign in with Google or GitHub.
2. Generate an MCP API key on the dashboard, copy it.
3. Add to Claude Desktop's `claude_desktop_config.json` (or Cursor / any MCP client):

    ```json
    {
      "mcpServers": {
        "cron": {
          "url": "https://cron.regiq.in/api/mcp",
          "headers": {
            "Authorization": "Bearer YOUR_KEY_HERE"
          }
        }
      }
    }
    ```

4. Have your agent call `schedule_job` with a cron expression, a prompt, and the URL you want us to POST to when it fires.

## Tools

| Tool | Purpose |
|------|---------|
| `schedule_job(name, cron, prompt, callbackUrl, ...)` | Create a scheduled prompt. |
| `list_jobs()` | Return every job owned by the calling key. |
| `get_job(id)` | One job + the last 20 fire attempts. |
| `update_job(id, ...)` | Partial update. Set `isActive: false` to pause. |
| `delete_job(id)` | Permanent delete. |

## Webhook payload

When a job fires, we POST:

```
POST <your callbackUrl>
Content-Type: application/json
X-Cron-Signature: <hex-hmac-sha256-of-body>

{
  "jobId":    "clx...",
  "name":     "daily AI news briefing",
  "prompt":   "summarise the top 5 AI news items from the last 24h",
  "metadata": { ... },
  "firedAt":  "2026-07-16T08:00:00.412Z"
}
```

**Verify the signature** by re-hashing the raw body with your shared signing secret (env `CRON_WEBHOOK_SIGNING_SECRET`) and comparing to the `X-Cron-Signature` header. Return any 2xx to mark the fire as ok — anything else is logged as a failure and the schedule still advances (so a failing callback won't stop future runs).

## Self-host

You'll need:
- Docker + Compose
- A Google OAuth client — [Cloud Console](https://console.cloud.google.com/apis/credentials). Scopes: `openid`, `email`, `profile`. Redirect: `<PUBLIC_BASE_URL>/api/auth/callback/google`
- A public HTTPS domain (Cloudflare Tunnel or `ngrok http 3015` locally)

**No LLM key required.** Your callback is where inference happens.

```bash
git clone https://github.com/globalion/cron-mcp
cd cron-mcp
cp .env.example .env
# fill NEXTAUTH_SECRET, GOOGLE_*, PUBLIC_BASE_URL, CRON_WEBHOOK_SIGNING_SECRET
docker compose up -d
# open http://localhost:3015
```

## Architecture

```
  Your agent                                Your callback
     │                                            ▲
     │ schedule_job(cron, prompt,                 │
     │              callback_url)                 │
     ▼                                            │
   ┌──────────────────────────────────────────────────┐
   │  cron-mcp (Hetzner)                              │
   │  - /api/mcp     Bearer-auth JSON-RPC             │
   │    · schedule_job, list, get, update, delete     │
   │  - Postgres: User, ApiKey, Job, JobRun           │
   │  - Scheduler loop (60s tick) — matches cron,     │
   │    POSTs signed webhook to callback_url,         │
   │    logs a JobRun row per fire.                   │
   └──────────────────────────────────────────────────┘
                             │
                             │  POST (signed)
                             ▼
                    Your callback runs the
                    prompt through the LLM +
                    tools and delivers the result.
```

## License

MIT. See `LICENSE`.
