# n8n Cloud to local

Move every workflow off paid n8n Cloud onto a free, self-hosted n8n in Docker, without losing anything and without touching what's still running on Cloud.

[![tests](https://github.com/krey-builds/n8n-cloud-to-local/actions/workflows/ci.yml/badge.svg)](https://github.com/krey-builds/n8n-cloud-to-local/actions/workflows/ci.yml)
![node](https://img.shields.io/badge/node-18%2B-1d2b2a)
![dependencies](https://img.shields.io/badge/dependencies-none-1d2b2a)
![license](https://img.shields.io/badge/license-MIT-1d2b2a)

These scripts come from moving my own 27 workflows (592 nodes) from n8n Cloud to Docker on my laptop, tidied up and generalised afterwards so they work for any account. After that move, every workflow matched its Cloud copy step for step: the same settings, positions and connections. Cloud stayed untouched the whole time, so nothing live broke.

Three scripts and a compose file. No dependencies, just Node 18 or newer.

| Script | Does |
|---|---|
| `backup.js` | Downloads every workflow from an instance into a folder of JSON files |
| `restore.js` | Imports that folder into the local n8n, every workflow **inactive** |
| `relink-credentials.js` | Points every node that needs a login type at the login you recreated locally |
| `docker-compose.yml` | n8n Community Edition, pinned version, data in a named volume |

## The move, step by step

```bash
cp .env.example .env          # fill in the Cloud URL + key and a new encryption key
docker compose up -d          # local n8n at http://localhost:5678; create the owner account + an API key
node backup.js --out backup   # 1. everything from Cloud to disk
node restore.js --from backup # 2. everything from disk into local, all inactive
# 3. In the local UI, recreate each login (same name as on Cloud), then:
node relink-credentials.js googlePalmApi --dry   # see what would change
node relink-credentials.js googlePalmApi         # do it
```

Do the relinking one login at a time, as you bring each workflow back into use. You don't need all of them on day one.

## Things that will bite you (each one bit me)

- **Credential secrets can't be exported.** Not by the API, not by anything. Imported workflows still point at Cloud credential ids that don't exist locally. Recreate each login once, then relink by type. The script refuses to guess when two local logins share a type.
- **A blank encryption key fails quietly.** `docker compose up` printed `N8N_ENCRYPTION_KEY variable is not set. Defaulting to a blank string` and started anyway, because an editor had saved a stale `.env` over the new key. Any login saved under a blank key is tied to a key you've lost. This compose file now refuses to start without one.
- **`docker compose down -v` deletes everything.** The `-v` removes the data volume. Never add it.
- **The health check lies about your API key.** The n8n MCP health check said "ok" with an expired key, because it doesn't authenticate. Test with a real authenticated call.
- **Not everything travels:**
  - run history
  - `staticData`, a trigger's memory of what it last saw, so Gmail and polling triggers start fresh
  - webhook URLs: the paths stay the same but the host changes, so anything calling a webhook has to be repointed
  - folders: the public API doesn't expose them, so they're recreated by hand
- **The API rejects some settings it exports** (for example `binaryMode`). The scripts send only the settings the API accepts.
- **Active workflows can't be deleted** through the API. Deactivate first.
- **Schedules run in UTC** until you set `GENERIC_TIMEZONE` to match your Cloud instance. A "9am" sweep otherwise fires at the wrong hour.
- **Windows PowerShell 5.1 says valid exports are broken.** `ConvertFrom-Json` rejected all 27 of my files. Node parsed all 27 fine. The checker was the problem, not the files.
- **Webhooks can't reach a laptop** from the internet. Workflows triggered by outside services (voice agents, form tools, booking tools) need a tunnel, or should stay on Cloud for now.

## Before you cancel Cloud

1. Every login you need is recreated and relinked.
2. Each workflow that was active on Cloud has been proven locally on a real input. Read the node output, not just the green tick.
3. A final `backup.js` run is saved somewhere other than your laptop.
4. You've decided what happens to webhook-triggered workflows (tunnel, or keep them on Cloud).
5. You've backed up `N8N_ENCRYPTION_KEY`.

## Develop

```bash
npm test
```

Covers `.env` parsing (including the trailing-space-gives-a-401 trap), the settings allowlist, Windows-safe file names, cursor pagination across pages, and that API errors never include the key.

Built with Claude Code. MIT licence.
