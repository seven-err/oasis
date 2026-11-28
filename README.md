# OASIS

Office Management System. This repository contains the React interface in
`frontend/` and the Laravel 13 application in `backend/`. Laravel serves the
built React screens, handles authentication and permissions, and saves business
records in MySQL.

## What GitHub stores

Repository: [seven-err/oasis](https://github.com/seven-err/oasis).
Both applications are versioned together; pushing a branch includes committed
changes from either directory.

| Component | Location | Included in GitHub? |
| --- | --- | --- |
| React screens, styles and frontend build configuration | `frontend/` | Yes |
| Laravel controllers, routes, Blade views and configuration templates | `backend/` | Yes |
| Database structure and account initialization code | `backend/database/migrations/`, `backend/database/seeders/` | Yes |
| Original SQL designs | `backend/database/sql/` | Yes; reference only, not the active migration system |
| Installed dependencies and generated builds | `node_modules/`, `backend/vendor/`, `frontend/dist/`, `backend/public/build/` | No; install/build on each host |
| Host configuration, app key and credentials | `backend/.env` | No; configure privately on each host |
| Actual accounts, employees, checks, payables, payments and receivables | MySQL database selected by `backend/.env` | No; back up and restore separately |
| Uploaded attachments | Private business-file directory on the host | No; back up and transfer separately |
| Browser drafts and old browser records | Browser localStorage | No |

**A Git push or GitHub Pages deployment does not back up the office database.**
A fresh clone with its own empty database will not contain the office records
or user accounts. See [Backup and transfer](#backup-and-transfer).

## How the application works

```text
Local development:
Browser -> Vite (127.0.0.1:5173) -> Laravel (127.0.0.1:8000) -> MySQL

Shared office deployment:
Browser -> ngrok HTTPS -> Caddy (127.0.0.1:8081)
        -> PHP FastCGI (127.0.0.1:9001) -> Laravel -> MySQL
                                                  -> private attachments

GitHub Pages -> redirects the browser to the shared HTTPS login
```

In development, Vite serves editable React pages and proxies login, account,
business-state and file requests to Laravel. In the office deployment, Laravel
reads `frontend/dist/.vite/manifest.json` and serves the React build through
`/oasis/assets/...`. Its own login/Blade assets come from `backend/public/build/`.
Keep the sibling `frontend/` and `backend/` directories together on the host;
both builds are required.

### Where to inspect saved records

The default connection in `backend/.env.example` is MySQL at `127.0.0.1:3306`,
database `oasis`. The private `backend/.env` supplies the actual connection.
MySQL stores its files in its own data directory, outside this repository.
To find that directory, run `SELECT @@datadir;` in your database client.
Use an SQL export for backup rather than copying live MySQL data files.

Open **Laragon -> Database** (usually HeidiSQL), connect using the settings in
`backend/.env`, then select the configured database. Current business records
are grouped by module in `business_states`; its `data` column is **LONGTEXT
containing JSON**, with one row per saved module, rather than one row per invoice.

| Data | Table / JSON location |
| --- | --- |
| Login accounts | `users` |
| Roles and access | `roles`, `permissions`, `role_permissions` |
| System/account/save activity | `activity_logs` |
| HR employee records | `business_states`, `module = 'hr'`, key `oasis.employees.v2` |
| Checks | `business_states`, `module = 'checks'`, key `oasis.checks.v1` |
| Payable invoices | `business_states`, `module = 'payables'`, key `oasis.payables.v1` |
| Payable payments | Same payables row, key `oasis.payable-payments.v1` |
| Receivables | `business_states`, `module = 'receivables'`, key `oasis.receivables.v1` |
| Collections | Same receivables row, key `oasis.receivable-collections.v1` |

Run these read-only queries after selecting the database:

```sql
SELECT module, version, updated_at
FROM business_states;

SELECT JSON_PRETTY(JSON_EXTRACT(data, '$."oasis.payables.v1"')) AS invoices,
       JSON_PRETTY(JSON_EXTRACT(data, '$."oasis.payable-payments.v1"')) AS payments
FROM business_states
WHERE module = 'payables';
```

To list individual payable invoices in MySQL 8:

```sql
SELECT p.invoiceNumber, p.totalAmount
FROM business_states AS b
CROSS JOIN JSON_TABLE(
    b.data,
    '$."oasis.payables.v1"[*]' COLUMNS (
        invoiceNumber VARCHAR(255) PATH '$.invoiceNumber',
        totalAmount DECIMAL(18,2) PATH '$.totalAmount'
    )
) AS p
WHERE b.module = 'payables';
```

Invoice numbers are text so leading zeros are retained. Paid totals, balances
and payment status are calculated from invoice/payment data by the interface.
Use the app to edit records: directly changing a snapshot bypasses application
validation and version/conflict handling. Do not import `database/sql/` into the
active database; those designs are not used by the current business-state API
and the checks script includes a second `users` table definition.

### Saves, drafts and attachments

Authenticated React screens read `GET /business-state` and save through
`PUT /business-state/{module}`. Wait for **All changes saved** before closing the
page. A failed save keeps a browser draft with download/retry options. A stale
module version is rejected instead of overwriting another user's changes;
download the draft and reload the latest records before reconciling a conflict.
Visible browsers check for updates every 30 seconds and on focus; open forms
keep their drafts. Each module snapshot is limited to 6 MB.

When a module has no shared snapshot yet, the first signed-in browser with old
localStorage records can import them. Sign in from the original hostname and
port before using a fresh browser for that module. Original browser storage is
retained. Once a snapshot exists, it is authoritative; other browser copies are
not automatically merged. Empty modules start without demo business records;
standard payable categories initialize when needed. Clearing browser storage
does not clear successfully saved MySQL records, but can discard unsaved drafts.

Check and receivable attachments upload through `/business-files/...` (10 MB
maximum per file) and are stored privately. The default directory is
`backend/storage/app/private/business-files`. For development and a separate
office checkout on the same PC, set the same absolute path in both private
`backend/.env` files, for example:

```dotenv
OASIS_BUSINESS_FILES_PATH="D:/OASIS-data/business-files"
```

Create that private directory and allow the server's Windows account to write
to it. Copy existing files there before switching paths; retain the originals
until downloads are verified. Sharing a database alone does not share files.
Use the same database connection in both checkouts only when development is
intended to edit the office's live records. For isolated development, use a
separate database and file directory.

## Requirements

- Git and Git LFS (`git lfs install` once before cloning).
- Node.js 22.12+ in the Node 22 line and npm. `.mise.toml` pins Node 22 and pnpm
  10.34.3. Commands below use `npx --yes pnpm@10.34.3`, so global pnpm is optional.
- PHP 8.3+ and Composer 2. Enable PDO MySQL for the app and PDO SQLite for tests;
  `composer check-platform-reqs` checks the installed packages' other requirements.
- MySQL 8, running before setup. Laragon's default is `127.0.0.1:3306`, user
  `root`, empty password; use your host's actual credentials.
- For the Windows office host: PowerShell, a compatible `php-cgi.exe`, Caddy,
  ngrok, and an assigned ngrok development domain.

The examples below use PowerShell. Run each block from the directory specified.
Replace example paths and `YOUR-DOMAIN` with your own values.

## First-time local development setup

Start MySQL in Laragon. In HeidiSQL, create an empty database if it does not exist:

```sql
CREATE DATABASE IF NOT EXISTS oasis
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

From your projects directory:

```powershell
git clone https://github.com/seven-err/oasis.git
cd oasis
Copy-Item backend/.env.example backend/.env
```

Edit `backend/.env` to match the database above. Keep `APP_ENV=local` for this
local setup. Then, from the repository root:

```powershell
cd backend
composer run setup-local
cd ../frontend
npx --yes pnpm@10.34.3 install --frozen-lockfile
npx --yes pnpm@10.34.3 build
npx --yes pnpm@10.34.3 dev
```

`setup-local` installs backend dependencies, generates the app key, migrates,
builds Laravel assets and creates local accounts. **Use it only for a fresh
local installation.** It generates a new app key; existing installations use
the update instructions below.

Save the separate random temporary passwords printed for:

| Account | Role |
| --- | --- |
| `super-admin@oasis.test` | Super Admin |
| `hr@oasis.test` | HR |
| `finance@oasis.test` | Finance |

Open **http://127.0.0.1:5173**. The frontend dev command starts Laravel on port
8000 if needed, then Vite on port 5173; keep this terminal running. PHP must be
on PATH, or set `PHP_BINARY`. Free port 5173 before starting. Local requests use
HTTP cookies without changing the office launcher's HTTPS settings.

Change each temporary password at first login. To create missing local accounts
later, run `php artisan db:seed --class=LocalDevelopmentSeeder --no-interaction`
from `backend/`. Existing passwords, roles and account status are preserved.
The seeder refuses to run unless `APP_ENV=local`; never use it on the office host.

## First-time shared office deployment (Windows)

### 1. Prepare a dedicated host checkout

Use a separate clean clone on `main`, for example `D:/oasis-office`, and keep
MySQL, the PC and its internet connection running. Teammates use the shared
browser URL; they do not install the repository or copy the host's `.env`.

For a **new, empty installation**, clone the repository and copy
`backend/.env.example` to `backend/.env` as above. Create the target database in
MySQL first. Configure the private `.env` before continuing:

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://YOUR-DOMAIN.ngrok-free.dev
SESSION_SECURE_COOKIE=true
SESSION_ENCRYPT=true
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=oasis
DB_USERNAME=YOUR_DATABASE_USER
DB_PASSWORD="YOUR_DATABASE_PASSWORD"
OASIS_BUSINESS_FILES_PATH="D:/OASIS-data/business-files"
```

Use an actual database user/password and create the private file directory.
If adopting the existing office database on the same PC, point to that database
and its existing file directory. If moving to another PC, follow
[Backup and transfer](#backup-and-transfer) first. A restored installation must
preserve its original `APP_KEY`; do not generate a replacement.

### 2. Install, migrate and build

From the new office checkout's root:

```powershell
cd backend
composer install --no-interaction --prefer-dist --optimize-autoloader
composer check-platform-reqs
php artisan config:clear --no-interaction
```

For a **new installation with a blank `APP_KEY` only**, generate its key once:

```powershell
php artisan key:generate --force --no-interaction
```

Then, from `backend/`:

```powershell
php artisan migrate --force --no-interaction
php artisan db:seed --class=RolePermissionSeeder --force --no-interaction
npm ci --ignore-scripts
npm run build
cd ../frontend
npx --yes pnpm@10.34.3 install --frozen-lockfile
npx --yes pnpm@10.34.3 exec tsc --noEmit
npx --yes pnpm@10.34.3 build
cd ..
```

Do not set `VITE_TEAM_URL` for the office or development build; it is a
Pages-only redirect setting. Do not run Vite development servers in the host
checkout; remove a leftover `backend/public/hot` before serving built assets.
For this launcher, leave Laravel configuration uncached: its production/HTTPS
values are supplied at process launch, and stale cached settings can override
those values. After editing `.env`, clear configuration and restart the server.
Do not rerun `composer run setup` or `setup-local` to update an existing host.

### 3. Create the initial administrator (new database only)

Privately set `OASIS_ADMIN_NAME`, `OASIS_ADMIN_EMAIL` and `OASIS_ADMIN_PASSWORD`
in `backend/.env`. Use a unique password of at least 12 characters with upper-
and lowercase letters, a number and a symbol. From `backend/`:

```powershell
php artisan config:clear --no-interaction
php artisan db:seed --class=SuperAdminSeeder --force --no-interaction
```

Remove the three initial-admin values after seeding and clear configuration
again. The seeder does not reset an existing administrator's password, create
an additional administrator, or promote an existing non-admin email. Restored
installations keep their existing accounts and do not need this step.

### 4. Start the shared HTTPS server

Place the official [Caddy Windows executable](https://caddyserver.com/download)
and [ngrok Windows executable](https://ngrok.com/download/windows) at:

```text
%LOCALAPPDATA%\OASIS\office-server\caddy.exe
%LOCALAPPDATA%\OASIS\office-server\ngrok.exe
```

Get your assigned development domain from your ngrok account. From the office
checkout's root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\start-office-server.ps1 -PublicUrl https://YOUR-DOMAIN.ngrok-free.dev
```

The launcher supports `ngrok-free.dev` and `ngrok-free.app` domains. Its first
run prompts for the authtoken or copied ngrok setup command with input hidden.
Credentials, logs and process state stay under the private runtime directory
above, outside Git. If PHP CGI is not found, add `-PhpCgiPath` with the full
path to your compatible `php-cgi.exe`. Use `-ResetToken` to replace a rejected
authtoken. Keep the CGI PHP version/extensions compatible with Composer's CLI PHP.

The launcher checks the local login page and the ngrok tunnel registration.
It supplies production mode, secure/encrypted sessions and disabled tunnel
request inspection. Caddy, FastCGI and the tunnel's local API bind to loopback;
no router port forwarding is required. Laravel trusts loopback proxies for this
setup; a different hosting/proxy arrangement requires corresponding configuration.

Open the printed **HTTPS `/login` URL** and confirm sign-in yourself. Change
the initial password, then create individual accounts in User Management.
Temporary passwords appear once; send them privately. Users contact a Super
Admin for resets. Resets/security changes revoke existing sessions and remembered
sign-ins. Role permissions can be adjusted in System Settings within each
department's boundaries. Existing unassigned/inactive accounts need a role and
activation before access. System activity timestamps use UTC.

Verify the intended records load, a permitted save reaches **All changes saved**,
and an uploaded file can be downloaded from another browser before sharing access.
Check [ngrok's current limits](https://ngrok.com/docs/pricing-limits/); polling,
page loads and uploads all count toward the plan's limits.

### 5. Point GitHub Pages at the office server

In the GitHub repository, open **Settings -> Secrets and variables -> Actions ->
Variables** and set `OASIS_TEAM_URL` to your shared HTTPS origin (no `/login`).
Run **Actions -> Deploy GitHub Pages -> Run workflow** on `main`. Pages must be
configured to use GitHub Actions as its publishing source.

[The Pages link](https://seven-err.github.io/oasis/) then redirects to the shared
login. Pages hosts static files only: it cannot run Laravel, MySQL or the office
server. Changing this variable requires another Pages build. The office host
must remain online for sign-in and records to work.

## Updating an existing installation

### Local development checkout

Commit your work first. From a clean `main` checkout at the repository root:

```powershell
git pull --ff-only origin main
cd backend
composer install --no-interaction --prefer-dist
php artisan config:clear --no-interaction
php artisan migrate --no-interaction
php artisan db:seed --class=RolePermissionSeeder --no-interaction
npm ci --ignore-scripts
npm run build
cd ../frontend
npx --yes pnpm@10.34.3 install --frozen-lockfile
npx --yes pnpm@10.34.3 build
```

Restart the dev command as needed. This preserves the database and app key.
Creating missing local test accounts is an optional, separate seeder step from
the local setup section. Do not run it against the shared office database.

### Office host: one-time update or automatic watching

Back up before schema changes. In the dedicated, clean office checkout on
`main`, run from its root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\update-office-server.ps1 -PublicUrl https://YOUR-DOMAIN.ngrok-free.dev -Watch
```

Omit `-Watch` for a one-time update. Add `-PhpCgiPath` if required by the launcher.
Complete initial setup, including the authtoken prompt, before using the watcher.

The updater checks `origin/main` every 30 seconds. It first installs, type-checks
and builds the proposed frontend in a temporary worktree while leaving the
running site alone. In watch mode a failed preflight is skipped until a newer
commit arrives; fix that commit and push through a PR. Tool checks, network fetch
failures, dirty worktrees and diverged history are handled before server shutdown.

After preflight passes, the updater stops the server, fast-forwards the checkout,
installs locked dependencies, clears cached configuration/views, runs pending
migrations and the role-permission seeder, builds both apps, removes a stale
`public/hot`, then restarts the same URL. It preserves existing role permission
settings, accounts, passwords, `.env`, app key and business records. It does not
seed local accounts or run `migrate:fresh`. Dependency/build/migration failures
after shutdown leave the server stopped; read the error, fix it and rerun.
There is no automatic database rollback.

Keep the watcher terminal running and refresh browsers after a deployment.
Feature-branch pushes do not deploy the office host until merged into `main`.
The host uses pinned pnpm through `npx`. Restart the watcher after its own script
changes. It is not installed as a Windows startup service; start it again after
a PC restart. The runtime `deployed-revision.txt` records the last successful
checkout, public URL and Git commit; verify the live login/records as well.

Press Ctrl+C to stop watching; this leaves the server running. To take the site
offline, stop the watcher first and then run from the host checkout's root:

```powershell
.\backend\start-office-server.ps1 -Stop
```

### Staging and rollback

Use a `staging` branch to test updates before publishing `main` to the office
server. Create it once from `main`:

```powershell
git switch main
git pull --ff-only origin main
git switch -c staging
git push -u origin staging
```

Once `origin/staging` exists, feature-branch PRs target `staging` and auto-merge
when checks pass. Run a separate staging checkout (with its own MySQL database
and `OASIS_BUSINESS_FILES_PATH` in `backend/.env` so testing never touches live
office data) using `-Branch staging`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\update-office-server.ps1 -PublicUrl https://YOUR-STAGING-DOMAIN.ngrok-free.dev -Branch staging
```

After verifying the update on staging, open a PR from `staging` into `main`.
PRs targeting `main` run all checks and wait for a manual merge click.

If a release on `main` breaks production, roll back in two steps:

1. **Immediate host rollback:** stop any running `-Watch` terminal, then run
   from the office checkout's root to restore the previous deployed commit
   recorded in `previous-revision.txt` (or pass `-Revision <commit>`):

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\update-office-server.ps1 -PublicUrl https://YOUR-DOMAIN.ngrok-free.dev -Rollback
   ```

2. **Permanent Git rollback:** push a `git revert <bad-commit>` PR into `main`
   and merge it before restarting `-Watch` (otherwise the watcher will redeploy
   the broken commit on `origin/main`). If the bad release changed the database
   schema or corrupted records, restore your pre-deploy SQL backup (see
   [Backup and transfer](#backup-and-transfer)).

## Backup and transfer

A complete backup has three parts: **the MySQL database, the private attachment
directory, and the private `.env` including the original `APP_KEY`**. Keep them
outside the repository, protect them as sensitive business data, and retain a
copy away from the host PC. Also note the deployed Git commit. Back up regularly
and before deployments that change the database.

For a consistent backup, stop the updater and stop every OASIS server using this
database (including local development). Ask users to finish and save first;
unsaved browser drafts are not in a database backup. Keep MySQL running during
an SQL export.

1. In HeidiSQL, select the configured database and use **Tools -> Export database
   as SQL**. Include all tables, their structure, and their data, and export to a
   private `.sql` file outside every Git checkout. Avoid destructive options on
   the source database. Check the export completes without errors.
2. Copy the entire directory selected by `OASIS_BUSINESS_FILES_PATH`, or
   `backend/storage/app/private/business-files` when that setting is blank.
   Preserve its subdirectories and filenames.
3. Copy the private `.env` to protected backup storage. Preserve `APP_KEY`; it
   is not a database password and must not be regenerated during a transfer.
4. Verify the SQL file is nonempty and test restoration to a separate database
   before relying on the backup. Restart the original services when finished.

An alternative SQL export, if `mysqldump` is on PATH, is shown below. Create the
private backup directory first, replace connection/path values with the actual
ones, and enter the database password at the prompt:

```powershell
mysqldump --host=127.0.0.1 --port=3306 --user=YOUR_DATABASE_USER --password --single-transaction --no-tablespaces --result-file="D:/OASIS-backups/oasis-backup.sql" oasis
```

Check the command's exit code and use a new filename for each backup. Use
`--result-file` rather than PowerShell `>` redirection to avoid SQL encoding
changes. Laragon includes `mysqldump.exe` under its MySQL `bin` directory if the
command is not on PATH.

To restore or move to another PC:

1. Keep the destination app offline. Install the requirements and clone the
   intended code version. Restore into a new empty MySQL database first, using
   HeidiSQL's **File -> Load SQL file** and executing the export. Review database
   selection/`CREATE DATABASE`/`USE`/`DROP` statements before executing so it
   targets the new database rather than an existing installation.
2. Restore the private `.env`; retain its original `APP_KEY`, update MySQL
   host/database/credentials and `APP_URL`, and set the destination's private
   attachment path. Copy the attachments there with the same relative filenames.
3. Follow the office install/build steps, **skipping key generation and initial
   admin/local-account seeding**. Run pending migrations for the selected code
   version. Role-permission seeding preserves existing role settings.
4. Configure the destination ngrok credentials/domain. Stop the old tunnel
   before moving its domain to the new host, then start the destination server
   and verify existing accounts, invoices, payment totals and file downloads.
   Do not run old and new hosts with separate databases behind one shared URL.
5. Update `OASIS_TEAM_URL` and rebuild Pages if the public origin changes. Keep
   the original backup until the restored installation is verified.

Never use `migrate:fresh`, `migrate:refresh`, `db:wipe`, or a replacement app key
as an update/restore step. Pulling or redeploying code cannot recover lost data.

## Checks and troubleshooting

From `backend/`:

```powershell
composer check-platform-reqs
php artisan migrate:status --no-interaction
php artisan test --compact
npm run build
```

Backend tests use in-memory SQLite from `phpunit.xml`, not the office MySQL
database. Keep the test configuration intact. From `frontend/`:

```powershell
npx --yes pnpm@10.34.3 exec tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
npx --yes pnpm@10.34.3 build
```

From the repository root, test the office updater without starting real services:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\backend\tests\OfficeServerUpdateTest.ps1
```

| Symptom | Check |
| --- | --- |
| Database connection/access error | MySQL is running; `.env` host, port, database and credentials match; clear stale config |
| Empty records after cloning | The clone points to a different/empty database; restore the real backup or use the intended existing database |
| Missing interface or assets | Build both apps; verify both Vite manifests; remove a stale `backend/public/hot` on the office host |
| Old UI at the shared URL | PR is merged to `main`; watcher is running without errors; compare deployed revision and refresh |
| Attachment missing on another checkout | Both checkouts use the same private directory, or the destination has received the file backup |
| Login/CSRF errors | Use a consistent hostname; check `APP_URL`, HTTPS cookies and uncached configuration; sign in again |
| Shared URL unavailable | Host is awake, MySQL is running, tunnel is connected, and ngrok plan limits have not been reached |
| Deployment failure | Read the updater terminal, `%LOCALAPPDATA%\OASIS\office-server` logs, and `backend/storage/logs/laravel.log`; keep credentials private |

## Making changes and confirming a push

Never commit directly to `main`. From a clean checkout:

```powershell
git switch main
git pull --ff-only origin main
git switch -c codex/short-name
```

Make the change and run the relevant checks. Stage only the intended files,
commit and push the branch, then open a pull request into `main`:

```powershell
git add README.md
git commit -m "Describe the change"
git push -u origin codex/short-name
gh pr create --base main --fill
```

Replace `README.md` with the files you actually changed. Never stage `.env`,
real database exports, private attachments or passwords. Business records are
edited through the app; changing demo data or storage keys does not update them.

The repository's **Ponytail Review & Auto-Merge** workflow runs updater tests,
frontend checks/build and backend tests, then attempts to merge passing PRs.
Inspect failures in the PR/Actions page; an open or failing PR has not reached
`main`. A merge triggers Pages separately, and the office site updates only
when the office watcher successfully pulls, builds and restarts. A successful
Pages build alone does not prove the backend or office deployment is healthy.

To confirm your branch reached GitHub:

```powershell
git fetch origin
git status --short --branch
git rev-list --left-right --count 'HEAD...@{upstream}'
```

`0 0` means the local branch matches its configured remote branch after fetch;
it does not by itself prove the PR is merged or that the office server has
deployed it. Check the PR, Actions runs and host updater separately. Resolve
any conflicts on the feature
branch, rerun checks and push again. Existing local clones use the update steps
after a merge; no database backup or business-data synchronization occurs in Git.
