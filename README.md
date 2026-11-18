# OASIS

Office Management System. `frontend/` is the React prototype, `backend/` is the Laravel + Blade app.

## Requirements

- Node.js 22 and pnpm
- PHP 8.3+ and Composer 2 (Laragon includes both)
- MySQL 8 (start it in Laragon with **Start All**)
- Git LFS (`git lfs install` once, before cloning)

## First-time setup

```bash
git clone https://github.com/seven-err/oasis.git
cd oasis

# Backend: installs packages, creates .env, app key, the `oasis` database and its tables
cd backend
composer run setup

# Frontend
cd ../frontend
pnpm install
```

`composer run setup` uses MySQL at `127.0.0.1:3306` as `root` with no password. If yours differs, edit `backend/.env` and run `php artisan migrate`.

## Running

Use two terminals, run from the repo root (one command per line, so it also works in Windows PowerShell):

```bash
# Terminal 1: http://localhost:8000
cd backend
composer run dev
```

```bash
# Terminal 2: http://localhost:5173 (open this one)
cd frontend
pnpm dev
```

## After pulling new changes

From the repo root:

```bash
git pull
cd backend
composer install
php artisan migrate
npm install
cd ../frontend
pnpm install
```

## Making changes

Never commit straight to `main`, and never leave finished work on a branch without a pull request: unmerged branches don't reach anyone.

1. Start from the latest `main`:
   ```bash
   git checkout main
   git pull
   git checkout -b feature/short-name
   ```
2. Make your change and test it with `pnpm dev` (in `frontend`).
3. If you changed starting data (e.g. `initialEmployees`, or sample checks, payables or receivables), bump that module's storage key version, e.g. `oasis.employees.v2` → `v3` (keys live in `App.tsx` and `frontend/src/modules/*/constants.ts`). Otherwise browsers keep their saved old data.
4. Commit and push your branch:
   ```bash
   git add -A
   git commit -m "Describe the change"
   git push -u origin feature/short-name
   ```
5. Open a pull request into `main` on GitHub (or `gh pr create --fill`).
6. The PR is reviewed and checked automatically. If it passes, it merges itself and the site at https://seven-err.github.io/oasis/ updates about 2 minutes later. If it fails, read the review comment on the PR, fix it on the same branch, and push again.
7. If GitHub says the branch has conflicts, update it from `main`, fix the marked files, then commit and push:
   ```bash
   git pull origin main
   ```
8. After a merge, everyone runs the "After pulling new changes" steps above.

## Seeing old data (e.g. Employee Alphalist)

Employee records are saved in each browser's localStorage, not the backend, so records you add are visible only to you. To load the latest list from the code, open the app, press F12 → Console, and run:

```js
localStorage.removeItem("oasis.employees.v2"); location.reload();
```

This deletes any employees you added in that browser.
