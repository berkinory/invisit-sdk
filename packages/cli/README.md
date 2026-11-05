# invisit

[![npm version](https://img.shields.io/npm/v/invisit?color=000&label=npm)](https://www.npmjs.com/package/invisit)
[![provenance](https://img.shields.io/badge/provenance-signed-000)](https://www.npmjs.com/package/invisit#provenance)
[![license](https://img.shields.io/npm/l/invisit?color=000)](https://github.com/berkinory/invisit-sdk/blob/main/packages/cli/LICENSE)

Installs [invisit](https://invisit.dev), privacy-first web analytics, in a web project with one command:

```sh
npx invisit init --site <site id>
```

It finds the framework and the package manager, installs [`@invisitdev/web`](https://www.npmjs.com/package/@invisitdev/web), and adds the few lines the [framework guide](https://invisit.dev/docs/web/frameworks) shows to the file they belong in. The site id is in the dashboard under **Settings → Installation**.

## Options

| Option         | What it does                                                                    |
| -------------- | ------------------------------------------------------------------------------- |
| `--site <id>`  | The site id. Without it, `INVISIT_SITE` is read, then a prompt asks (TTY only). |
| `--dir <path>` | The project to install into. Needed at a monorepo root with several web apps.   |
| `--dry-run`    | Prints the changes as a unified diff and changes nothing.                       |
| `--no-install` | Edits the code but leaves installing `@invisitdev/web` to you.                  |
| `--script-tag` | Adds the script tag to the HTML `<head>` instead of the npm package.            |
| `--yes`, `-y`  | Skips the confirmation prompt. Without a TTY there are no prompts at all.       |

Exit codes: `0` done (or already set up), `1` needs input (a site id, `--dir`, an unknown project), `2` failed (the install did not complete).

## What it changes

| Framework                     | Change                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Next.js (App Router)          | `app/analytics.tsx`, rendered after `{children}` in `app/layout.tsx`                     |
| Next.js (Pages Router)        | `components/analytics.tsx`, rendered beside `<Component />` in `pages/_app.tsx`          |
| TanStack Start                | `src/components/analytics.tsx`, rendered before `<Scripts />` in `src/routes/__root.tsx` |
| React Router, Remix           | `app/analytics.tsx`, rendered before `<Scripts />` in `app/root.tsx`                     |
| Waku                          | `src/components/analytics.tsx`, rendered after `{children}` in `src/pages/_layout.tsx`   |
| Nuxt                          | `app/plugins/invisit.client.ts`, plus `runtimeConfig.public.invisitSite`                 |
| SvelteKit                     | `init()` in the script of `src/routes/+layout.svelte`                                    |
| Astro                         | a `<script>` before `</head>` in the base layout                                         |
| SolidStart                    | `init()` in `src/entry-client.tsx`                                                       |
| Vite (React, Vue, Svelte, …)  | `init()` at the top of the entry module `index.html` loads                               |
| Angular 19+                   | an app initializer in `src/app/app.config.ts`                                            |
| Gatsby, Docusaurus, VitePress | `gatsby-browser`, a client module, or the theme's `enhanceApp`                           |
| Plain HTML                    | the script tag before `</head>` in each page                                             |

Frameworks that read the id from a public environment variable (`NEXT_PUBLIC_INVISIT_SITE`, `VITE_INVISIT_SITE`, `PUBLIC_INVISIT_SITE`, `WAKU_PUBLIC_INVISIT_SITE`, `NUXT_PUBLIC_INVISIT_SITE`) get it appended to their `.env` file; set the same variable where the site is built in production.

## Safety

- Edits only insert lines. Nothing is reformatted, and quotes, semicolons and indentation follow the file.
- Each insertion needs exactly one place to go, such as one `{children}` or one `</head>`. When there are none or several, nothing is changed, and the steps to do by hand are printed with the exact snippet for each file.
- A project that already imports `@invisitdev/web` or loads `invisit.js` is left as it is, so running it twice changes nothing.
- No telemetry and no network calls of its own: the only request is your package manager installing `@invisitdev/web`.

## License

[MIT](LICENSE)
