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

## Seeing old data (e.g. Employee Alphalist)

Employee records are saved in each browser's localStorage, not the backend, so records you add are visible only to you. To load the latest list from the code, open the app, press F12 → Console, and run:

```js
localStorage.removeItem("oasis.employees.v2"); location.reload();
```

This deletes any employees you added in that browser.
