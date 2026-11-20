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

# Local development: installs packages, creates .env, app key, tables and local accounts
cd backend
composer run setup-local

# Frontend
cd ../frontend
pnpm install
pnpm build
```

Setup uses MySQL at `127.0.0.1:3306` as `root` with no password. If yours differs,
copy `backend/.env.example` to `backend/.env` and edit its database settings before
running setup. Keep MySQL running. Run first-time setup only once: it generates
the app key. For an existing clone, use the update steps below instead.

Local setup prints a separate random temporary password for each account:

| Local account | Role |
| --- | --- |
| `super-admin@oasis.test` | Super Admin |
| `hr@oasis.test` | HR |
| `finance@oasis.test` | Finance |

Save the printed passwords and change each at first login. To add these accounts
to an existing local checkout, run `php artisan db:seed --class=LocalDevelopmentSeeder`
from `backend/`. Repeating this command preserves existing passwords, roles and
account status. A local Super Admin can reset a forgotten HR/Finance password.
The seeder refuses to run unless `APP_ENV=local`; it is never used by the office
updater. Passwords, `.env` files and databases are not copied through Git.
On the office PC, local development and the ngrok host use the same
`backend/.env` database, so accounts and business records are shared. A clone
on a different PC with its own MySQL database remains a separate installation.

## Running

The Laravel app includes email/password login, Super Admin / HR / Finance access,
personal password changes, user administration, permission settings and activity
logs. Successful sign-in opens the existing React OASIS interface, including
its HR Alphalist, Check, Payable and Receivable screens. Laravel checks access
on direct module URLs; the React sidebar and dashboard use the same permissions.
Business records are saved in MySQL through the authenticated Laravel backend.
The existing React screens and record formats are retained, with access checked
for each module. Shared attachments are stored privately on the host PC.

For the shared office host, use `composer run setup` for its first-time setup
and set `APP_ENV=production`, `APP_DEBUG=false` in its private `backend/.env`.
Do not use `setup-local` on that host. Initialize access control:

```bash
cd backend
php artisan migrate --force
php artisan db:seed --class=RolePermissionSeeder --force
```

Set `OASIS_ADMIN_NAME`, `OASIS_ADMIN_EMAIL` and `OASIS_ADMIN_PASSWORD` in your
local environment or secret manager, then run:

```bash
php artisan db:seed --class=SuperAdminSeeder --force
```

Use a unique initial password of at least 12 characters with uppercase and
lowercase letters, a number and a symbol. Remove the three initial-admin values
after seeding and rebuild cached configuration if used. Repeating the seeder
does not reset an existing administrator's password; an email collision with a
non-admin account stops setup without promoting that account. Default seeding
no longer creates `test@example.com` with a known password.

Build the existing interface with `pnpm build` in `frontend/`, then open
`http://localhost:8000/login`. The initial administrator
must change their password before accessing the dashboard. Create further
accounts in User Management. Temporary passwords appear once in the creation
or reset response; deliver them using an approved private channel. They are not
emailed, logged or stored in session flash data. Password resets and security
changes revoke existing sessions and remembered sign-ins. With no public
registration or self-service recovery, users contact a Super Admin for resets.

During development, open `http://localhost:5173`. Sign-in and account requests
are proxied to Laravel on port 8000; dashboard and module pages use Vite so
saved UI edits appear immediately. `npm run dev` (or `pnpm dev`) in `frontend/`
starts Laravel on port 8000 automatically when it is not already running, then
starts Vite. PHP must be on PATH (or set `PHP_BINARY`) and MySQL must be running.
It uses local HTTP cookies without changing the ngrok server's HTTPS settings.
Both processes use the same `backend/.env` database; no passwords are reset.
After changing a temporary password, subsequent sign-ins require the new
password. GitHub Pages serves static files only; authenticated use requires
the Laravel server as well.

Existing accounts remain in place but receive no role or active access
automatically. Assign their roles and activate them through User Management.
System Settings can reduce HR/Finance module permissions within their fixed
department boundaries; dashboard and personal account access are retained.

Production requires HTTPS: use `APP_ENV=production`, `APP_DEBUG=false` and
`SESSION_SECURE_COOKIE=true`. Configure trusted proxies for the actual hosting
environment when TLS terminates at a proxy. System activity timestamps are UTC.
Never run the reference SQL scripts directly: the checks script includes a
second `users` table definition that must be omitted when porting the modules.

Backend verification uses an isolated in-memory SQLite database:

```bash
cd backend
php artisan test
npm run build
```

Run from the repo root:
```bash
# http://127.0.0.1:5173 (open this one)
cd frontend
npm run dev
```

## After pulling new changes

From the repo root:

```bash
git pull
cd backend
composer install
php artisan migrate
php artisan db:seed --class=RolePermissionSeeder
npm install
npm run build
# Existing local clones only: creates missing local accounts without resetting existing ones
php artisan db:seed --class=LocalDevelopmentSeeder
cd ../frontend
pnpm install
pnpm build
```

## Shared access from the office PC

The shared instance runs Laravel through Caddy and PHP FastCGI, with ngrok
providing the public HTTPS address. MySQL and the office PC must stay running.
Teammates use the shared browser URL; they do not need to install the project
or copy the office PC's `.env` file.

On the host PC, build both apps using the commands above. Place the official
[Caddy Windows executable](https://caddyserver.com/download) and
[ngrok Windows executable](https://ngrok.com/download/windows) in
`%LOCALAPPDATA%\OASIS\office-server`, named `caddy.exe` and `ngrok.exe`.
Sign in to a free ngrok account and find its assigned development domain.
From the repository root, run this with that domain:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\start-office-server.ps1 -PublicUrl https://YOUR-DOMAIN.ngrok-free.dev
```

The first run prompts for the ngrok authtoken or its copied setup command.
Input is hidden. Agent credentials and runtime logs are stored privately under
`%LOCALAPPDATA%\OASIS\office-server`, outside Git. If PHP is not found, pass
`-PhpCgiPath` with the full path to PHP 8.3+ `php-cgi.exe`.
If ngrok rejects a token, rerun with `-ResetToken` to enter its current value.

The launcher checks both the local login page and the connected public tunnel.
It uses production mode, secure cookies, encrypted sessions, and disabled
request-body inspection. Only loopback ports are opened; no inbound router
port forwarding is required. Share the printed HTTPS login URL, then create
individual teammate accounts in User Management.

Set the GitHub repository Actions variable `OASIS_TEAM_URL` to the shared
HTTPS origin, then run the Pages deployment. The existing GitHub Pages link
will send teammates to the shared login instead of trying to run PHP on Pages.

To make merged UI changes appear at the ngrok URL automatically, keep a clean
checkout on `main` on the office PC, separate from development branches.
Run this from that checkout's root after completing the host setup above:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\update-office-server.ps1 -PublicUrl https://YOUR-DOMAIN.ngrok-free.dev -Watch
```

Leave this terminal running. It checks `origin/main` every 30 seconds. After a
teammate's PR merges into `main`, it stops the server, fast-forwards the host
checkout, installs locked dependencies, migrates without deleting data, builds
both apps, and restarts the same ngrok URL. Refresh the browser after deployment.
Feature-branch pushes go through the PR checks before they reach this host.
The updater preserves accounts, passwords, the app key, `.env` and existing
permission settings. It does not seed local accounts or run `migrate:fresh`.
The host uses the pinned pnpm version through `npx`, so it does not need a global
pnpm command. Required tools are checked before stopping the running server.
Back up the shared database before merging schema changes.

For a one-time update, omit `-Watch`. Pass `-PhpCgiPath` if the launcher needs
it. Updates briefly take the site offline. A failed deployment stops the
updater and leaves the server stopped; fix the reported error and rerun it.
Network fetch failures in watch mode are retried without stopping the server.
The updater refuses dirty worktrees, development branches and diverged history.
Restart the watcher after changes to the updater script itself.

Press Ctrl+C to stop watching; that leaves the web server running. To take the
site offline, stop the watcher first, then run:

```powershell
.\backend\start-office-server.ps1 -Stop
```

The free ngrok plan currently includes an assigned stable domain, 1 GB/month
of outbound transfer and 20,000 requests/month, with a first-visit browser
notice. Check [ngrok's current free-plan limits](https://ngrok.com/docs/pricing-limits).
This shares accounts and HR/Finance records through the office PC's MySQL
database. Saves report their status; a failed or conflicting save preserves an
unsaved copy with download/retry options. Concurrent edits to the same module
require reloading rather than silently overwriting another person's changes.
Other visible browsers check for updates every 30 seconds and on focus, while
open edit forms keep their draft. Polling and uploads count against ngrok limits.
Module snapshots are limited to 6 MB; uploaded attachments are limited to 10 MB.
When the public host uses a separate checkout on the same PC, set
`OASIS_BUSINESS_FILES_PATH` in both private `backend/.env` files to the same
absolute directory outside the repositories. This shares uploaded files as well
as database records. Without this setting, files use each checkout's
`backend/storage/app/private/business-files`. Copy existing files into the shared
directory before switching paths; keep the originals until verified.
Back up the MySQL database and the private business-file directory.

## Making changes

Never commit straight to `main`, and never leave finished work on a branch without a pull request: unmerged branches don't reach anyone.

1. Start from the latest `main`:
   ```bash
   git checkout main
   git pull
   git checkout -b feature/short-name
   ```
2. Make your change and test it with `pnpm dev` (in `frontend`).
3. Business records now come from MySQL. Changing demo data or storage keys does not update shared records; use the application's record forms instead.
4. Commit and push your branch:
   ```bash
   git add -A
   git commit -m "Describe the change"
   git push -u origin feature/short-name
   ```
5. Open a pull request into `main` on GitHub (or `gh pr create --fill`).
6. The PR is reviewed and checked automatically. If it passes, it merges itself. GitHub Pages updates separately; the shared ngrok site updates when the office PC's watcher pulls and builds the merged code. If checks fail, read the review comment on the PR, fix it on the same branch, and push again.
7. If GitHub says the branch has conflicts, update it from `main`, fix the marked files, then commit and push:
   ```bash
   git pull origin main
   ```
8. After a merge, everyone runs the "After pulling new changes" steps above.

## Existing browser records

When a module has no shared snapshot yet, the first signed-in browser imports
its existing saved records for that module. Sign in first from the hostname
and port where the office's records were previously entered. Original browser
storage is retained as a backup; no demo business records are inserted into an
empty shared module. Standard payable categories are initialized when needed.
Once a shared snapshot exists, it is authoritative. Copies from other browsers
are retained locally and are not automatically merged into the shared data.
Clearing browser storage no longer resets the shared records.
