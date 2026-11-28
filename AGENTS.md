# OASIS

OASIS Office Management System. One repo, two apps:

- `frontend/` - React + Vite + Tailwind CSS v4 interface; authenticated business records sync to Laravel/MySQL, with browser drafts and legacy import in `localStorage`
- `backend/` - Laravel 13 + Blade + MySQL; serves the built React screens, authentication, permissions, business-state API and private attachments

Setup for a fresh clone is in `README.md`.

## Latest Updates & After Pulling

Read this first after pulling `main` or `staging`:

- **Shared frontend modules (`a364e6f`):** Common module UI (`PanelTitle`, `FormInput`, `PaginationBar`, `SectionCard`, `DetailGrid`, `MoneySummaryStrip`, etc.) now lives in `frontend/src/components/ModuleUi.tsx`; shared utilities (`peso`, `formatDate`, `sortRecords`, `downloadCsv`, `readFileAsDataUrl`, etc.) live in `frontend/src/components/moduleUtils.ts`; shared soft-delete/retention store methods live in `frontend/src/components/deletedRecordRetention.ts`. Edit or reuse these shared files instead of duplicating code across `checks/`, `payables/`, and `receivables/`.
- **Staging & rollback workflow (`9489dc6`):** Target feature-branch PRs to `staging` (auto-merges when checks pass), then promote `staging` -> `main` via PR. Host deploys and rollbacks use `backend/update-office-server.ps1` (see `README.md`).
- **What to do first after pulling:** No new dependencies or database migrations are needed for these updates. If serving via Laravel, rebuild the frontend bundle (`cd frontend && pnpm build`), then verify with `cd frontend && pnpm exec tsc --noEmit && node --test tests/*.test.mjs` and `cd backend && php artisan test`.

## Development Servers

```bash
cd frontend && pnpm dev        # http://localhost:5173 (stop other apps using this port first)
cd backend && composer dev     # http://localhost:8000 (server, queue, logs, Vite)
```

## Frontend structure (`frontend/`)

Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/modules/{checks,payables,receivables}/` - Module screens, `store.ts` (uses shared business storage), `validation.ts`, `seed.ts`; `ui.tsx` and `utils.ts` re-export shared code from `src/components/ModuleUi.tsx` and `src/components/moduleUtils.ts`
- `src/components/{ModuleUi.tsx,moduleUtils.ts,deletedRecordRetention.ts}` - Shared module UI components, formatting/CSV/sorting helpers, and soft-delete retention lifecycle methods
- `src/businessStorage.ts` - MySQL-backed module synchronization through Laravel, browser draft recovery and legacy localStorage import; keys are in `src/businessKeys.json`
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and the `@` alias for `src`
- `scripts/` - `ponytail-review.mjs` (PR checks) and `deploy-pages.ps1` (GitHub Pages)
- `tests/` - Node test runner tests

Runtime: React 19. Build tooling: Vite 8, TypeScript 5.7, `@vitejs/plugin-react`. Formatting: oxfmt.

## Backend structure (`backend/`)

Standard Laravel 13 layout: `routes/web.php`, `app/Http/Controllers`, `app/Models`, `resources/views` (Blade), `database/migrations`.

- `database/sql/` - Original hand-written MySQL schema for checks, payables and receivables. Reference for writing Laravel migrations; not run by `php artisan migrate`.
- `database/migrations/` - Active schema, including `business_states`: one row per module, with records stored as JSON in a LONGTEXT `data` column. Actual MySQL data is outside Git; see README backup/transfer instructions.
- `.env.example` - Defaults to MySQL `oasis` on `127.0.0.1:3306`, user `root`, empty password (Laragon defaults).
- Tests use in-memory SQLite (`phpunit.xml`), so `php artisan test` needs no MySQL.

## Styling

Both apps use **Tailwind CSS v4** through `@tailwindcss/vite`. Global CSS lives in `frontend/src/index.css` and `backend/resources/css/app.css`. No Tailwind or PostCSS config file is needed.

Tailwind emits utility classes in `@layer utilities`, and CSS outside any cascade layer overrides every layer regardless of specificity. Put global element styles, such as resets and defaults for `body`, headings, `button`, or `input`, inside `@layer base { ... }` so utility classes on those elements still apply. Tailwind's Preflight already applies `box-sizing: border-box`, removes default margins, and sets `font: inherit` on form controls, so do not repeat those rules.

`.mise.toml` pins Node.js and pnpm; the toolchain also expects PHP 8.3+ and Composer 2.
