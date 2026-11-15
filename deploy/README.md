# Deploying Fusion

Fusion is the full product in [github.com/Runfusion/Fusion](https://github.com/Runfusion/Fusion).
The 23 files in this repository are a slice of it (the Neural Command Map components, the view
registry and the locale JSON) — there is no root manifest, lockfile or app entry here, so this
checkout cannot be built or deployed on its own. Any deployment builds upstream.

## What Fusion needs to run

| Requirement | Detail |
| --- | --- |
| Long-running Node server | Dashboard + HTTP API + SSE on `4040` (`fn dashboard --host 0.0.0.0`), not a static SPA |
| Persistent global state | `/home/node/.fusion` — embedded PostgreSQL, settings, agents |
| Persistent projects | `/workspace` — where Fusion clones and builds the repos it works on |
| Always on | Agents run in the background; the process must not scale to zero |
| Git + a writable filesystem | Agents work in git worktrees under the project |
| Provider credentials | At least one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`; `GITHUB_TOKEN` for private repos |
| Dashboard token | `FUSION_DASHBOARD_TOKEN` — the dashboard is bearer-token protected; only `/api/health` is public |

The upstream container contract is documented in `docs/docker.md`: image built from the repo's
`Dockerfile`, port `4040`, volumes at `/home/node` and `/workspace`, `HEALTHCHECK` on
`/api/health`.

## Managed host (recommended): Fly.io

`fly.toml` and `deploy-fly.sh` in this folder wrap that contract: one always-on 2 GB machine,
a 20 GB volume at each persistent path, HTTPS, and the health check on `/api/health`.

```bash
curl -L https://fly.io/install.sh | sh            # flyctl
export FLY_API_TOKEN=...                           # https://fly.io/user/personal_access_tokens
export FUSION_DASHBOARD_TOKEN=fn_<your own stable token>
export ANTHROPIC_API_KEY=...                       # at least one provider
./deploy/deploy-fly.sh
```

It creates the app (`FLY_APP`, default `fusion-dashboard`), creates the `fusion_home` and
`fusion_workspace` volumes if missing, sets the secrets it finds in the environment, then builds
with Fly's remote builder and deploys. The first build compiles the whole monorepo and takes a
while; later deployments reuse the cache.

Afterwards the dashboard is at `https://<app>.fly.dev`. Sign in with the token you set (or read the
auto-generated one from `fly logs` if you skipped it), and add provider keys under
**Settings → Authentication** if you did not pass them as secrets.

Two caveats specific to a hosted instance: provider OAuth logins that rely on a loopback callback
(Anthropic `53692`, Codex `1455`) cannot complete from a remote origin — use API keys, or the Codex
device-code flow. And a single machine is intentional: Fly volumes are bound to one machine and one
region.

Equivalent alternatives with a persistent disk and an always-on container: Render (Docker service +
disk), Railway (volume), or any VM running `docker run -p 4040:4040 -v fusion-home:/home/node -v
fusion-workspace:/workspace <image>`.

## Not the way: the old VPS static build

`deploy/setup.sh` in this folder builds `@fusion/dashboard` and serves the output as a static SPA
from nginx on port 80. That no longer matches the product — the dashboard package is a React UI
*plus an Express API server with SSE*, and Fusion keeps its state in embedded Postgres under
`/home/node/.fusion`. A static nginx root would serve the UI shell with no API behind it, and no
agent could run. Use the container path above (a VM with Docker works just as well as Fly).
