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

```bash
cd backend && composer run dev   # http://localhost:8000
cd frontend && pnpm dev          # http://localhost:5173
```

## After pulling new changes

```bash
cd backend && composer install && php artisan migrate && npm install
cd frontend && pnpm install
```
