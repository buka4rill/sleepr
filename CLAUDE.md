# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **pnpm** (see `pnpm-lock.yaml`).

- `pnpm install` — install dependencies
- `pnpm run build` — build via `nest build`
- `pnpm run start:dev` — run the app in watch mode
- `pnpm run start:debug` — run with debugger + watch
- `pnpm run lint` — eslint over `src`, `apps`, `libs`, `test` with `--fix`
- `pnpm run format` — prettier over `src`, `libs`, `test`
- `pnpm run test` — run all unit tests (Jest)
- `pnpm run test -- <path or -t "name">` — run a single test file or test by name
- `pnpm run test:watch` — Jest in watch mode
- `pnpm run test:cov` — Jest with coverage
- `pnpm run test:e2e` — e2e tests using `test/jest-e2e.json`

Unit tests are colocated `*.spec.ts` files under `src/` and `libs/`; Jest resolves the `@app/common` path alias via `moduleNameMapper` in `package.json`.

## Architecture

This is a **NestJS monorepo** (single app today, structured for microservices) managed through `nest-cli.json`, which declares a library project named `common` rooted at `libs/common`.

- `src/` — the main application (`AppModule`, bootstrapped in `src/main.ts`).
- `libs/common/src/` — shared library code, imported elsewhere via the path alias `@app/common` (and `@app/common/*` for subpaths), configured in `tsconfig.json` and mirrored in `package.json`'s Jest `moduleNameMapper`. Each subfolder under `libs/common/src` (e.g. `config/`, `database/`) exports itself through a local `index.ts`, and `libs/common/src/index.ts` re-exports those.
- `libs/common/src/config/config.module.ts` — wraps `@nestjs/config`'s `ConfigModule.forRoot(...)` with Joi validation (currently requires `MONGODB_URI`) and **exports** `NestConfigModule` so `ConfigService` is injectable by any module that imports this `ConfigModule`. When adding new required env vars, extend the Joi `validationSchema` here.
- `libs/common/src/database/database.module.ts` — configures `MongooseModule.forRootAsync`, injecting `ConfigService` from `ConfigModule` to read `MONGODB_URI`. Any feature module needing MongoDB imports this `DatabaseModule`.
- Environment variables live in `.env` at the repo root (currently just `MONGODB_URI`).

Since `libs/common` is set up as a `library` project in `nest-cli.json` with its own `tsconfig.lib.json`, new shared modules should go under `libs/common/src/<name>/` with their own `index.ts`, then be re-exported from `libs/common/src/index.ts`.
