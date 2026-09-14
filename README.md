# HSA Saver

A vault for HSA receipts: capture them now, prove them decades later.

An HSA reimbursement has no deadline. You can pay a medical bill today, leave
the money invested, and reimburse yourself twenty years from now — but only if
you can still produce the receipt. This keeps them, and keeps them provable.

SvelteKit + SQLite (Drizzle) + sharp, running in Docker on a Raspberry Pi
behind Cloudflare Access.

## What it does

- **Capture** — photograph a receipt from your phone, crop it, and file it
  against a provider, date and amount.
- **Vault** — the running unreimbursed total, split into what is documented
  (provable) and what is merely recorded, over a daily cumulative chart.
- **Audit** — each receipt is checked for the things that would sink a claim:
  a missing image, incomplete fields, an accidental duplicate (matched on the
  image's SHA-256), or one already reimbursed.
- **Backups** — nightly encrypted snapshots off the Pi, with a weekly drill
  that proves they restore. See [scripts/README.md](scripts/README.md).

## Developing

```sh
pnpm install
pnpm dev
```

Creates `data/hsa.db` and `data/uploads/` on first run and applies migrations
automatically. Authentication is bypassed in dev: every request is `DEV_EMAIL`.

To develop against a copy of the real data, see
[Developing against production data](scripts/README.md#developing-against-production-data).

### Environment

`.env` for local development; the Pi's values live in its `docker-compose.yml`
and `~/apps/hsa/.env`.

| Variable                | Default         | Notes                                               |
| ----------------------- | --------------- | --------------------------------------------------- |
| `DATABASE_PATH`         | `data/hsa.db`   | SQLite file. WAL mode — never copy it with `cp`.    |
| `UPLOAD_ROOT`           | `data/uploads`  | Original images and derivatives.                    |
| `DEV_EMAIL`             | `dev@localhost` | Who you are in dev. Matched case-insensitively.     |
| `CF_ACCESS_TEAM_DOMAIN` | —               | e.g. `yourteam.cloudflareaccess.com`.               |
| `CF_ACCESS_AUD`         | —               | Application audience tag from the Access app.       |
| `FORCE_ACCESS`          | unset           | `1` to exercise real Access verification in dev.    |
| `BODY_SIZE_LIMIT`       | `512K`          | adapter-node. Needs raising to accept phone photos. |

Both path variables are read at startup, so pointing them at a restored copy
runs the whole app against it without touching your working `data/`:

```sh
DATABASE_PATH=/tmp/hsa-from-pi/hsa.db UPLOAD_ROOT=/tmp/hsa-from-pi/uploads pnpm dev
```

### Authentication

In production every request must carry a `Cf-Access-Jwt-Assertion` header,
verified against Cloudflare's JWKS. There is no login form, no session and no
password: the tunnel is the only way in, and a request that reaches the app
without a valid token is rejected outright.

The email in that token identifies the user. It is **normalised to lowercase**
before lookup — SQLite's `TEXT` comparison is case-sensitive, so an identity
provider that changes `gregory@…` to `Gregory@…` would otherwise create a
second, empty account and the vault would silently appear to have no receipts.

## Testing

```sh
pnpm test          # 93 tests
pnpm test:watch
```

Database tests build an in-memory SQLite from the real migrations. Importing
`src/lib/server/db/index.ts` under vitest **throws deliberately** — a fixture's
`delete` once ran against the live database because `.env` outranked the
environment the test harness set. Mock it and use `makeTestDb()` instead.

Pure logic is kept outside `$lib/server` precisely so it can be tested without a
database: `chart.ts` (projection and daily series), `crop.ts` (crop geometry),
`providers.ts` (autocomplete ranking).

```sh
pnpm check    # svelte-check
pnpm lint     # prettier + eslint
```

## Deploying

Pushing to `main` builds an arm64 image and pushes it to
`ghcr.io/greggon/hsa-tracker:latest`. Once that finishes:

```sh
pnpm deploy
```

which pulls the new image on the Pi and restarts the container.

**Migrations apply on container start**, from the `drizzle/` folder baked into
the image — there is no separate migration step to remember. Two consequences
worth knowing:

- `pnpm build` also applies them, against whatever `DATABASE_PATH` resolves to
  locally, because the build imports the database module. `pnpm check` does not.
- Migrations run with `PRAGMA foreign_keys = OFF` and a `foreign_key_check`
  afterwards that refuses to start the app on a violation. SQLite rebuilds a
  table by dropping it, and a drizzle-emitted `PRAGMA foreign_keys=OFF` is a
  no-op inside the migrator's own transaction — without the wrapper, a table
  rebuild cascades and deletes every dependent row. This is not hypothetical;
  it happened, and it emptied `documents`.

The backup and restore scripts deliberately **are not** in the image — they run
on the host so they still work when the container is down, and `pnpm deploy`
does not copy them. Use `pnpm deploy:scripts`.

## Layout

```
src/lib/              chart.ts, crop.ts, providers.ts — pure, tested
src/lib/components/   AppChrome, ReceiptList, ImageCropper, ProviderInput
src/lib/server/       access.ts (JWT), images.ts (sharp), storage.ts, db/
src/routes/           / (vault), /receipts, /receipts/[id], /documents/[id]
drizzle/              migrations, applied at startup
scripts/              host-side backup and restore — see scripts/README.md
```

`data/` and the `data.local-*` / `data.restored-*` / `data.broken-*` copies the
scripts leave behind are gitignored: they contain real receipts.
