# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

- `pnpm install` — install dependencies
- `pnpm run build <app>` — build one app via `nest build` (e.g. `pnpm run build reservations`)
- `pnpm run start:dev <app>` — run one app in watch mode (e.g. `pnpm run start:dev auth`); `<app>` is one of `auth`, `reservations`, `payments`, `notifications`
- `pnpm run start:debug <app>` — run with debugger + watch
- `pnpm run lint` — eslint over `src`, `apps`, `libs`, `test` with `--fix`
- `pnpm run format` — prettier over `src`, `libs`, `test`
- `pnpm run test` — run all unit tests (Jest)
- `pnpm run test -- <path or -t "name">` — run a single test file or test by name
- `pnpm run test:watch` — Jest in watch mode
- `pnpm run test:cov` — Jest with coverage
- `pnpm run test:e2e` — e2e tests using `test/jest-e2e.json`

Unit tests are colocated `*.spec.ts` files under `apps/*/src/` and `libs/`; Jest resolves the `@app/common` path alias via `moduleNameMapper` in `package.json`.

## Architecture

This is a **NestJS monorepo** of four independently deployable microservices, managed through `nest-cli.json`, which also declares a library project named `common` rooted at `libs/common`. There is no root `src/` app — each service under `apps/` has its own `main.ts`, module, Dockerfile, and (for `auth`/`reservations`) HTTP surface.

- `apps/reservations/` — public HTTP API (`POST/GET/PATCH/DELETE /reservations`), guarded by the shared `JwtAuthGuard`. On create, it calls `payments` over TCP (`create_charge`) then persists the reservation via `ReservationsRepository` (Mongo).
- `apps/auth/` — public HTTP API for `/auth/login` (Passport local strategy, sets an httpOnly `Authentication` JWT cookie) and `/users` (signup/get current user). Also exposes a TCP-only `authenticate` message pattern (`@MessagePattern`) used internally by `JwtAuthGuard` from other services to validate a JWT and fetch the user from Mongo.
- `apps/payments/` — TCP-only microservice (`@MessagePattern('create_charge')`), charges via Stripe, then fires an `@EventPattern`-style TCP event (`notifications_service.emit('notify_email', …)`, fire-and-forget) to `notifications`.
- `apps/notifications/` — TCP-only microservice (`@EventPattern('notify_email')`), sends email via Gmail SMTP using Google OAuth2 credentials.
- `libs/common/src/` — shared library code, imported elsewhere via the path alias `@app/common` (and `@app/common/*` for subpaths), configured in `tsconfig.json` and mirrored in `package.json`'s Jest `moduleNameMapper`. Each subfolder under `libs/common/src` (`config/`, `database/`, `auth/`, `constants/`, `decorators/`, `dto/`, `health/`, `logger/`) exports itself through a local `index.ts`, and `libs/common/src/index.ts` re-exports those.
- `libs/common/src/config/config.module.ts` — wraps `@nestjs/config`'s `ConfigModule.forRoot(...)` with Joi validation (currently requires `MONGODB_URI`) and **exports** `NestConfigModule` so `ConfigService` is injectable by any module that imports this `ConfigModule`. When adding new required env vars, extend the Joi `validationSchema` here.
- `libs/common/src/database/database.module.ts` — configures `MongooseModule.forRootAsync`, injecting `ConfigService` from `ConfigModule` to read `MONGODB_URI`. Any feature module needing MongoDB imports this `DatabaseModule`.
- `libs/common/src/auth/jwt-auth.guard.ts` — the shared `JwtAuthGuard` used by `reservations` (and available to any other HTTP service): extracts the `Authentication` cookie and calls `auth`'s TCP `authenticate` pattern rather than verifying the JWT locally.
- `libs/common/src/health/` — `HealthModule`/`HealthController` (`GET /` → `{ status: 'ok' }`), currently wired into `auth` and `reservations` only. Not yet wired to any Kubernetes `livenessProbe`/`readinessProbe` — see Kubernetes section below.
- Each app reads its own `.env` (e.g. `apps/auth/.env`, gitignored) for local `start:dev`/docker-compose use — there's no single repo-root `.env` anymore.

Since `libs/common` is set up as a `library` project in `nest-cli.json` with its own `tsconfig.lib.json`, new shared modules should go under `libs/common/src/<name>/` with their own `index.ts`, then be re-exported from `libs/common/src/index.ts`.

For the full request/response path across services (guards, TCP message patterns, Stripe, notifications), see `code-architecture-diagram.jpg` in the repo root.

## Local development

Two independent local setups exist — **do not run both at once**, they fight over host ports `3000`/`3001`:

- **`docker-compose up`** — hot-reload dev loop (`nest start --watch` per service, bind-mounted source). Uses its own in-compose `mongo` container (see each `apps/*/.env`), separate from the Atlas cluster used by the Helm/Kubernetes path below. `reservations` binds host `3000`, `auth` binds host `3001`; `payments`/`notifications` have no host port (TCP-only, reached over the compose network).
- **Helm chart on a local cluster** (`docker-desktop` Kubernetes) — see Kubernetes section below; also lands on host `3000`/`3001` via `LoadBalancer` Services.

If one is already holding those ports when you start the other, the second one's containers/pods will come up but silently fail to bind the host port (Docker Desktop can be slow to release a `LoadBalancer` port mapping after `helm uninstall`) — recreate them (`docker compose up -d --force-recreate reservations auth`) once the other side has fully torn down (`kubectl get pods` / `kubectl get all` shows nothing left).

## Kubernetes / Deployment

Helm chart: `k8s/sleepr/`. Images are built and pushed to Artifact Registry by `cloudbuild.yaml` (`us-east1-docker.pkg.dev/sleepr-506112/<app>/production`); deploying them is a separate manual step, not wired into `cloudbuild.yaml`:
```
helm upgrade --install sleepr k8s/sleepr -f k8s/sleepr/values.yaml -f k8s/sleepr/values.secrets.yaml
```

For a GKE deploy, layer in the production overlay before the secrets file:
```
helm upgrade --install sleepr k8s/sleepr -f k8s/sleepr/values.yaml -f k8s/sleepr/values.production.yaml -f k8s/sleepr/values.secrets.yaml
```

- `values.yaml` — non-secret config per app, checked into git. Defaults `reservations`/`auth-http` to `type: LoadBalancer` and `gateway.enabled: false`, which is what the local Docker Desktop cluster uses.
- `values.production.yaml` — non-secret GKE overlay, checked into git. Flips `reservations`/`auth-http` to `ClusterIP` and sets `gateway.enabled: true` with `gateway.className: gke-l7-global-external-managed`, so a single `Gateway` + `HTTPRoute` (`templates/gateway.yaml`, `templates/httproute.yaml`) fronts both Services instead of two separate billed `LoadBalancer` IPs. This GKE cluster has **no classic `gce` IngressClass registered** (`kubectl get ingressclass` returns nothing) — it only supports the Kubernetes Gateway API, so a plain `Ingress` resource silently never gets an address; use `Gateway`/`HTTPRoute` for any further external-routing changes, not `Ingress`. Not used locally — Docker Desktop has no Gateway controller, so applying this overlay there would make `reservations`/`auth-http` unreachable.
- The Gateway currently only has an HTTP listener on port 80 (no TLS, no domain, IP is not reserved so it can change if the Gateway is recreated) — see the "not yet done" list below.
- `values.secrets.yaml` — real credentials (Mongo Atlas URI, Stripe key, Google OAuth), **gitignored**, never committed. Copy `values.secrets.yaml.example` to get the expected shape when setting this up fresh (e.g. on another machine).
- MongoDB is **Atlas** (`sleepr.lifsfh1.mongodb.net`), not an in-cluster Deployment — there is no `mongo` chart template.
- `NodePort` was tried first for local access but Docker Desktop's NodePort→`localhost` forwarding proved unreliable even after a full cluster restart; `LoadBalancer` (which Docker Desktop maps straight to `localhost:<port>`) is what's used for local `reservations`/`auth-http` access instead.
- Changing a `Secret`/`ConfigMap`'s contents via `helm upgrade` does **not** restart pods that reference it (Kubernetes only rolls pods on a pod-template change) — follow with `kubectl rollout restart deployment/<name>` or the pod keeps running on stale env vars.
- Restarting Docker Desktop's Kubernetes cluster (or Docker Desktop itself) wipes the cluster back to empty — it does not preserve `helm`-deployed state. Expect to `helm install` again afterward.
- Not yet done: `livenessProbe`/`readinessProbe` on any Deployment (the `HealthModule` above exists but isn't wired up yet), `resources` requests/limits, HPA, an automated deploy step in `cloudbuild.yaml`, HTTPS/managed cert + domain + reserved static IP on the Gateway, and explicit Gateway health checks (currently working only incidentally, via GCLB's default `/` check).

For the deployment topology (Services, Pods, external dependencies), see `architecture-diagram.jpg` in the repo root.

## API testing (Postman)

`postman/` holds a Postman **file-based collection** ("Sleepr API"), synced via Postman's Local Git integration (`.postman/resources.yaml` links this folder to a Postman workspace). Requests never hardcode a host — they use `{{baseUrl}}` (reservations) and `{{authBaseUrl}}` (auth) collection variables, so switching hosts is just switching the active Postman environment:

- `postman/environments/Local.environment.yaml` — `baseUrl`/`authBaseUrl` → `localhost:3000`/`localhost:3001`, for either local setup in the section above.
- `postman/environments/Production.environment.yaml` — both point at the GKE Gateway IP (plain `http://`, no TLS — see the Gateway caveat above). That IP is **not reserved**, so re-check/update this file if the Gateway gets recreated.

Session state (`jwt`, `reservationId`) stays as collection variables in `.resources/definition.yaml`, auto-populated by `afterResponse` scripts on Login/Create Reservation — those aren't environment-specific.
