# Deploying cron-mcp to Hetzner + regiq.in

Deploy pattern for future Claude Code sessions working on this repo.

## Server (shared with the rest of the Globalion MCP fleet)
- SSH: `root@89.167.56.16`
- Service directory: `/opt/cron-mcp/`
- Domain: `cron.regiq.in` (Cloudflare-tunnelled to `cron-mcp-web:3000`)
- Container names: `cron-mcp-web`, `cron-mcp-db`
- **NEVER touch** other people's folders under `/opt/` — see `shreyas-onboarding.md` §7.

## Deploy a new version

From this repo on your dev machine:

```bash
tar --exclude=node_modules --exclude=.next --exclude=.git -cf - . \
  | ssh root@89.167.56.16 "mkdir -p /opt/cron-mcp && tar -xf - -C /opt/cron-mcp/"
ssh root@89.167.56.16 "cd /opt/cron-mcp && docker compose up -d --build"
```

## First-time subdomain wiring (`cron.regiq.in`)

1. Add an ingress rule to `/opt/platform/cloudflared/config.yml` on the server, BEFORE the final catch-all rule:
   ```yaml
   - hostname: cron.regiq.in
     service: http://cron-mcp-web:3000
   ```
2. Restart the tunnel: `ssh root@89.167.56.16 "docker restart platform-cloudflared-1"`
3. Create the DNS CNAME via the tunnel's own creds (no API token needed):
   ```bash
   ssh root@89.167.56.16 "docker exec platform-cloudflared-1 cloudflared tunnel route dns 0caf1caf-59f6-4f36-9ea5-4aa9a9f41d0b cron.regiq.in"
   ```

## Env vars

Populated on the server via `/opt/cron-mcp/.env` (NOT committed to git). Values live in `shreyas-onboarding.md` for shared secrets, per-app secrets are generated fresh:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — created per-MCP in Google Cloud Console
- `NEXTAUTH_SECRET` — `openssl rand -base64 32`
- `PUBLIC_BASE_URL=https://cron.regiq.in`
- `NEXTAUTH_URL=https://cron.regiq.in`

## Health & debugging

```bash
curl https://cron.regiq.in/api/admin/health
ssh root@89.167.56.16 "docker ps --filter name=cron-mcp --format 'table {{.Names}}\t{{.Status}}'"
ssh root@89.167.56.16 "docker logs cron-mcp-web --tail 60"
```

## Rules (from shreyas-onboarding.md §7)

- ✅ **No LLM in this stack.** cron-mcp is a pure transport bridge — the user's agent supplies the model. If a future feature needs inference, route via OpenRouter with the shared Globalion key, never vendor APIs direct.
- ✅ Expose `/api/admin/health` (already wired at `src/app/api/admin/health/route.ts`).
- ✅ Container names prefixed with `cron-mcp-` and unique across the fleet.
- ✅ Container-internal port is any port (3000 here); Cloudflare tunnel handles external HTTPS.
