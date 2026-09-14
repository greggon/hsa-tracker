# HSA Saver

A vault for HSA receipts: capture them now, prove them decades later.

SvelteKit + SQLite (Drizzle) + sharp, deployed to a Raspberry Pi behind
Cloudflare Access. See [scripts/README.md](scripts/README.md) for backups.

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
pnpm dlx sv@0.17.0 create --template minimal --types ts --add prettier eslint --install pnpm ./
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## Testing

```sh
pnpm test
```

Runs against an in-memory database built from the real migrations, so tests can
never reach a file on disk.

## Backups

Nightly snapshots to object storage, with a weekly restore drill. See
[scripts/README.md](scripts/README.md).
