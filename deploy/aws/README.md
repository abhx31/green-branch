# Deploying the backends to AWS EC2

Both backends run on one EC2 instance with Docker Compose. The frontend runs on Vercel.

```
Browser ──► Vercel (frontend + /api/* server routes)
   │            │  /api/sessions → https://API_DOMAIN/runner/api/v1/sessions
   │            │  /api/runs, /api/pr → https://API_DOMAIN/api/v1/...
   │            ▼
   └── wss ──► Caddy :443 on EC2 ──► server-ai :8000 ──► server-ec2 :8001 ──► Redis
                   └── /runner/* ──────────────────────► server-ec2         └─► python-executor
                                                                                node-executor
```

Only Caddy is reachable from the internet (ports 80 and 443). It gets the HTTPS certificate
for `API_DOMAIN` from Let's Encrypt by itself. server-ec2 runs each repository's install and
test commands in the two executor containers through the Docker socket.

| File | Purpose |
|------|---------|
| `docker-compose.yml` | The six services |
| `Caddyfile` | HTTPS and routing |
| `.env.example` | Settings and secrets; the real file lives at `/home/ubuntu/greenbranch/.env` |
| `setup-instance.sh` | One-time instance setup (Docker, swap, folders), passed as EC2 user-data |
| `deploy.sh` | Builds and starts a release, checks `/health`, rolls back on failure |
| `../../.github/workflows/aws-deploy.yaml` | Runs `deploy.sh` on every push to `main` that changes a backend |

## One-time setup

### 1. AWS resources

An Ubuntu 24.04 `t3.medium` with 30 GB gp3, a security group allowing 22, 80 and 443, an
SSH key pair, and an Elastic IP. `setup-instance.sh` is the instance's user-data.

### 2. DNS

Add an `A` record for `API_DOMAIN` (e.g. `api.example.com`) pointing at the Elastic IP.

### 3. The `.env` on the instance

```bash
scp -i greenbranch.pem deploy/aws/.env.example ubuntu@<elastic-ip>:greenbranch/.env
ssh -i greenbranch.pem ubuntu@<elastic-ip> 'nano greenbranch/.env && chmod 600 greenbranch/.env'
```

Use long random values for both API keys, e.g. `openssl rand -base64 32`.

### 4. GitHub repository secrets

| Secret | Value |
|--------|-------|
| `EC2_HOST` | The Elastic IP |
| `EC2_SSH_KEY` | Contents of `greenbranch.pem` |
| `EC2_KNOWN_HOSTS` | Output of `ssh-keyscan -t ed25519 <elastic-ip>` |

Then run **Deploy backends to AWS EC2** from the Actions tab (or push a backend change).

### 5. Vercel

Import the repository with **Root Directory** `frontend` and set these environment variables
(Production):

| Variable | Value |
|----------|-------|
| `NEXTAUTH_URL` | `https://<your-app>.vercel.app` |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `GITHUB_ID` / `GITHUB_SECRET` | A GitHub OAuth app whose callback is `https://<your-app>.vercel.app/api/auth/callback/github` |
| `AGENT_SERVER_URL` | `https://API_DOMAIN` |
| `AGENT_SERVER_API_KEY` | `SERVER_API_KEY` from the instance's `.env` |
| `EC2_AGENT_URL` | `https://API_DOMAIN/runner` |
| `EC2_AGENT_API_KEY` | `EC2_AGENT_API_KEY` from the instance's `.env` |
| `NEXT_PUBLIC_SERVER_WS_URL` | `wss://API_DOMAIN/api/v1` |

`NEXT_PUBLIC_SERVER_WS_URL` is built into the page, so redeploy the frontend after changing it.
To deploy from GitHub Actions instead of Vercel's Git integration, add the `VERCEL_TOKEN`,
`VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` secrets used by `vercel-deploy.yaml`.

## Operating

```bash
ssh -i greenbranch.pem ubuntu@<elastic-ip>
cd ~/greenbranch/current/deploy/aws
docker compose ps
docker compose logs -f server-ai server-ec2
docker compose restart server-ai          # e.g. after editing ~/greenbranch/.env
curl https://API_DOMAIN/api/v1/health
```

Each deploy unpacks into `~/greenbranch/releases/<commit>`; `~/greenbranch/current` points at
the live one, and the three newest are kept.
