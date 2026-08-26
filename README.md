<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

<p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>

# Sleepr

Sleepr is a hotel reservation system built as a **NestJS monorepo of four independently deployable microservices**:

| Service | Role | Surface |
|---|---|---|
| `auth` | Signup/login, JWT issuance, user lookup | HTTP (`/auth`, `/users`) + internal TCP (`authenticate`) |
| `reservations` | Create/read/update/delete reservations | HTTP (`/reservations`), guarded by JWT |
| `payments` | Charges a card via Stripe | Internal TCP only (`create_charge`) |
| `notifications` | Sends confirmation emails via Gmail SMTP | Internal TCP only (`notify_email` event) |

`reservations` calls `payments` over TCP to charge a card, `payments` fires a TCP event to `notifications` to send a confirmation email, and both public HTTP services validate requests through a shared `JwtAuthGuard` (in `libs/common`) that calls back into `auth` over TCP. See [`code-architecture-diagram.jpg`](./code-architecture-diagram.jpg) for the full request path and [`architecture-diagram.jpg`](./architecture-diagram.jpg) for the deployment topology.

## Table of contents

- [Prerequisites](#prerequisites)
- [Project setup](#project-setup)
- [Environment variables](#environment-variables)
- [Running the project](#running-the-project)
  - [Option A — Nest CLI, bare metal](#option-a--nest-cli-bare-metal)
  - [Option B — Docker Compose](#option-b--docker-compose)
  - [Option C — Kubernetes (Helm, local cluster)](#option-c--kubernetes-helm-local-cluster)
- [Testing](#testing)
- [Docker: building and pushing images](#docker-building-and-pushing-images)
- [Kubernetes & Helm reference](#kubernetes--helm-reference)
- [Deploying to production (GKE)](#deploying-to-production-gke)
- [Known gaps / not yet done](#known-gaps--not-yet-done)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js + [pnpm](https://pnpm.io/) (version pinned in `package.json`'s `packageManager` field; run `corepack enable` to get the right one automatically)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — for the Compose workflow, and its bundled local Kubernetes cluster for the Helm workflow
- [Helm](https://helm.sh/) — only needed for the Kubernetes workflows (local or GKE)
- [gcloud CLI](https://cloud.google.com/sdk/docs/install) — only needed for pushing images to Artifact Registry or deploying to GKE

## Project setup

```bash
pnpm install
```

Each app reads its own env file at `apps/<app>/.env` (gitignored — not present on a fresh clone). Create these four files using the [Environment variables](#environment-variables) reference below before running anything locally.

## Environment variables

These are the variables each app's `apps/<app>/.env` needs. Values shown are placeholders — never commit real secrets into these files or into this doc.

**`apps/auth/.env`**

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Mongo connection string |
| `JWT_SECRET` | Signing secret for issued JWTs |
| `JWT_EXPIRATION` | Token lifetime in seconds |
| `HTTP_PORT` | Port for the public `/auth`, `/users` HTTP surface |
| `TCP_PORT` | Port for the internal `authenticate` TCP microservice |

**`apps/reservations/.env`**

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Mongo connection string |
| `PORT` | Port for the public `/reservations` HTTP surface |
| `AUTH_HOST` / `AUTH_PORT` | Where to reach `auth`'s TCP microservice |
| `PAYMENTS_HOST` / `PAYMENTS_PORT` | Where to reach `payments`'s TCP microservice |

**`apps/payments/.env`**

| Variable | Purpose |
|---|---|
| `PORT` | Port for the internal `create_charge` TCP microservice |
| `STRIPE_SECRET_KEY` | Stripe secret key (use a `sk_test_...` key for local dev) |
| `NOTIFICATIONS_HOST` / `NOTIFICATIONS_PORT` | Where to reach `notifications`'s TCP microservice |

**`apps/notifications/.env`**

| Variable | Purpose |
|---|---|
| `PORT` | Port for the internal `notify_email` TCP microservice |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REFRESH_TOKEN` | Google OAuth2 credentials for sending mail via Gmail SMTP |
| `SMTP_USER` | The Gmail address mail is sent from |

> ⚠️ **The `HOST` values and `MONGODB_URI` differ per run mode.** As shipped, these `.env` files are set up for the **Docker Compose** workflow — `AUTH_HOST=auth` etc. resolve via Compose's internal network DNS, and `MONGODB_URI` points at Compose's own `mongo` container. Running bare-metal via Nest CLI needs different values — see the callout in [Option A](#option-a--nest-cli-bare-metal) below.

## Running the project

Three ways to run this locally, plus GKE for production. **Don't run Compose and the local Helm chart at the same time** — both bind host ports `3000`/`3001` and will silently fail to bind if the other already holds them.

### Option A — Nest CLI, bare metal

No Docker at all — fastest inner loop, but you provide your own MongoDB and run each service in its own terminal.

1. Adjust each `apps/<app>/.env`:
   - `MONGODB_URI` — point at a reachable Mongo instance. Compose's `mongo:27017` hostname won't resolve outside its network, and Compose doesn't publish a host port for it either. Easiest options: run `docker run -d --name mongo -p 27017:27017 mongo` and use `mongodb://localhost:27017/sleepr`, or point straight at the Atlas cluster used by the Kubernetes workflows (get the connection string from `k8s/sleepr/values.secrets.yaml`, or ask whoever set that up).
   - `AUTH_HOST`, `PAYMENTS_HOST`, `NOTIFICATIONS_HOST` — change from the service names (`auth`, `payments`, `notifications`) to `localhost`, since each app now runs directly on your machine rather than on a Compose network.
2. Run each app in its own terminal (`<app>` is one of `auth`, `reservations`, `payments`, `notifications`):
   ```bash
   pnpm run start:dev <app>
   ```
   Or with the debugger attached:
   ```bash
   pnpm run start:debug <app>
   ```
3. `reservations` → `http://localhost:3000`, `auth` → `http://localhost:3001`. `payments`/`notifications` are TCP-only and have nothing to browse to.

### Option B — Docker Compose

Hot-reload dev loop in containers — bind-mounted source, `nest start --watch` per service, own disposable Mongo.

```bash
docker compose up
```

- `reservations` → `http://localhost:3000`
- `auth` → `http://localhost:3001`
- `payments`/`notifications` have no host port — they're reached over the internal Compose network only
- Mongo is a plain `mongo` image, wiped whenever its container is removed

```bash
# recreate specific services (useful after the local Helm chart releases 3000/3001)
docker compose up -d --force-recreate reservations auth

# tear down
docker compose down
```

### Option C — Kubernetes (Helm, local cluster)

Runs the actual Helm chart against Docker Desktop's built-in Kubernetes cluster. Also lands on host `3000`/`3001`, via `LoadBalancer` Services this time (Docker Desktop maps these straight to `localhost`).

```bash
# make sure your kubectl context is the local cluster, not a GKE one
kubectl config use-context docker-desktop

helm upgrade --install sleepr k8s/sleepr -f k8s/sleepr/values.yaml -f k8s/sleepr/values.secrets.yaml
```

- `values.secrets.yaml` is gitignored — copy `k8s/sleepr/values.secrets.yaml.example` and fill in real credentials (Atlas URI, Stripe key, Google OAuth) the first time you set this up.
- MongoDB here is **Atlas**, not an in-cluster container — this is a different database from the one Docker Compose uses.
- Restarting Docker Desktop (or its Kubernetes cluster) wipes it back to empty; you'll need to `helm upgrade --install` again afterward.

See [Kubernetes & Helm reference](#kubernetes--helm-reference) below for the rest of the day-to-day commands (checking status, restarting after a secret change, uninstalling).

## Testing

```bash
pnpm run test                       # all unit tests
pnpm run test -- <path or -t "name">  # a single file or test by name
pnpm run test:watch                 # watch mode
pnpm run test:cov                   # with coverage
pnpm run test:e2e                   # e2e tests
```

Unit tests are colocated `*.spec.ts` files under `apps/*/src/` and `libs/`; Jest resolves the `@app/common` alias via `moduleNameMapper` in `package.json`.

## Docker: building and pushing images

Each app has its own multi-stage `Dockerfile` (`development`/`production` targets) under `apps/<app>/Dockerfile`. The build **context must be the repo root**, not the app folder — the Dockerfiles `COPY` in `libs/` and the root `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`.

```bash
# build (repo root as context, note the -f)
docker build -t us-east1-docker.pkg.dev/sleepr-506112/reservations/production -f apps/reservations/Dockerfile .

# tag an existing image for the registry (if you built it under a different name/tag)
docker tag reservations:latest us-east1-docker.pkg.dev/sleepr-506112/reservations/production

# authenticate Docker to Artifact Registry (one-time per machine)
gcloud auth configure-docker us-east1-docker.pkg.dev

# push
docker push us-east1-docker.pkg.dev/sleepr-506112/reservations/production

# pull (e.g. on another machine, or to inspect what's live)
docker pull us-east1-docker.pkg.dev/sleepr-506112/reservations/production
```

Repeat per app — `reservations`, `auth`, `payments`, `notifications` — substituting the app name in both the `-f` path and the image tag.

**`cloudbuild.yaml`** does the build+push step for all four apps in one go via Google Cloud Build:

```bash
gcloud builds submit --config cloudbuild.yaml
```

This only builds and pushes images to Artifact Registry — it does **not** deploy them. Deploying (the `helm upgrade` below) is a separate, manual step.

## Kubernetes & Helm reference

Commands used day-to-day while running/operating the chart at `k8s/sleepr/`.

**Contexts** — know which cluster you're pointed at before running anything:

```bash
kubectl config get-contexts        # list available contexts
kubectl config current-context     # which one is active right now
kubectl config use-context docker-desktop                    # local
kubectl config use-context gke_sleepr-506112_us-east1_sleepr  # GKE
```

If the GKE context isn't listed yet:

```bash
gcloud container clusters get-credentials sleepr --region us-east1 --project sleepr-506112
```

**Install/upgrade** — same command installs or upgrades, idempotently:

```bash
# local (Docker Desktop)
helm upgrade --install sleepr k8s/sleepr -f k8s/sleepr/values.yaml -f k8s/sleepr/values.secrets.yaml

# GKE (adds the production overlay — see below)
helm upgrade --install sleepr k8s/sleepr -f k8s/sleepr/values.yaml -f k8s/sleepr/values.production.yaml -f k8s/sleepr/values.secrets.yaml
```

- `values.yaml` — non-secret defaults, checked into git. `reservations`/`auth-http` are `LoadBalancer`, external routing (`gateway.enabled`) is off — this is what the local cluster uses.
- `values.production.yaml` — non-secret GKE overlay, checked into git. Flips `reservations`/`auth-http` to `ClusterIP` and turns on a `Gateway`/`HTTPRoute` (`gateway.enabled: true`) as the single external entry point instead of two separate `LoadBalancer` IPs.
- `values.secrets.yaml` — real credentials, gitignored, never committed. Copy `values.secrets.yaml.example` for the expected shape.

**Checking status:**

```bash
kubectl get all                    # pods, services, deployments, replicasets
kubectl get gateway,httproute       # GKE only — external routing status (see note below)
kubectl logs <pod> --previous       # logs from a crashed/restarted container
```

**After changing a `Secret`/`ConfigMap`** (e.g. new values in `values.secrets.yaml`): a `helm upgrade` alone does **not** restart pods that reference it — Kubernetes only rolls pods on a pod-template change. Follow up with:

```bash
kubectl rollout restart deployment/<name>
```

**Uninstalling:**

```bash
helm uninstall sleepr
```

> **Classic `Ingress` does not work on the GKE cluster used by this project** — it has no `gce` IngressClass registered (`kubectl get ingressclass` returns nothing) and only supports the **Gateway API**. External routing changes belong in `templates/gateway.yaml`/`templates/httproute.yaml`, not a `networking.k8s.io/Ingress` resource — a plain `Ingress` here would silently never receive an address.

## Deploying to production (GKE)

1. Build and push fresh images (either manually per [Docker: building and pushing images](#docker-building-and-pushing-images), or `gcloud builds submit --config cloudbuild.yaml` for all four at once).
2. Point `kubectl`/`helm` at the GKE cluster:
   ```bash
   kubectl config use-context gke_sleepr-506112_us-east1_sleepr
   ```
3. Deploy with the production overlay:
   ```bash
   helm upgrade --install sleepr k8s/sleepr -f k8s/sleepr/values.yaml -f k8s/sleepr/values.production.yaml -f k8s/sleepr/values.secrets.yaml
   ```
4. Confirm the Gateway got an external address (can take several minutes on first provision, up to 10–15 for the global external LB):
   ```bash
   kubectl get gateway sleepr
   ```

## Known gaps / not yet done

- No `livenessProbe`/`readinessProbe` on any Deployment (the shared `HealthModule` — `GET /` → `{status:'ok'}` — exists and is wired into `auth`/`reservations`, but nothing in the chart uses it yet)
- No `resources` requests/limits on any container
- No Horizontal Pod Autoscaler
- No automated deploy step in `cloudbuild.yaml` — pushing images and deploying them are separate manual steps
- The GKE Gateway currently only has an HTTP listener (port 80) — no TLS/managed certificate, no domain, and its IP isn't reserved, so it can change if the Gateway is ever recreated
- No `apps/*/.env.example` files — a fresh clone has to build its `.env` files from the [Environment variables](#environment-variables) table above rather than copying a template

## Troubleshooting

- **Compose and local Helm fighting over ports `3000`/`3001`**: Docker Desktop can be slow to release a `LoadBalancer` port mapping after `helm uninstall`. Confirm the other side is fully torn down (`kubectl get all` / `docker compose down` shows nothing left) before starting the other, then `docker compose up -d --force-recreate reservations auth` if needed.
- **A `helm upgrade` with new secret values doesn't seem to take effect**: pods don't restart automatically on `Secret`/`ConfigMap` changes — run `kubectl rollout restart deployment/<name>`.
- **Docker Desktop's Kubernetes cluster looks empty after a restart**: expected — restarting Docker Desktop (or its cluster) wipes Helm-deployed state; `helm upgrade --install` again.
- **An `Ingress` you added isn't getting an address on GKE**: this cluster doesn't support classic `Ingress` — use `Gateway`/`HTTPRoute` instead (see the callout in [Kubernetes & Helm reference](#kubernetes--helm-reference)).

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
