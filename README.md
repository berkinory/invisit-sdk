# invisit SDKs

[![@invisitdev/web](https://img.shields.io/npm/v/@invisitdev/web?color=000&label=%40invisitdev%2Fweb)](https://www.npmjs.com/package/@invisitdev/web)
[![@invisitdev/server](https://img.shields.io/npm/v/@invisitdev/server?color=000&label=%40invisitdev%2Fserver)](https://www.npmjs.com/package/@invisitdev/server)
[![invisit](https://img.shields.io/npm/v/invisit?color=000&label=invisit)](https://www.npmjs.com/package/invisit)
[![Publish](https://github.com/berkinory/invisit-sdk/actions/workflows/publish.yml/badge.svg)](https://github.com/berkinory/invisit-sdk/actions/workflows/publish.yml)
[![license](https://img.shields.io/badge/license-MIT-000)](LICENSE)

The code that runs on your site and your server for [invisit](https://invisit.dev), privacy-first web analytics. Published in full so you can read exactly what it does before you ship it.

## Packages

| Package                                  | Description                                                                            | Docs                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------ |
| [`@invisitdev/web`](packages/web)        | The browser tracker as a typed, SSR-safe ES module, for any framework.                 | [README](packages/web/README.md)           |
| [`@invisitdev/server`](packages/server)  | First-party tracker proxy, crawler analytics and server-side events, on web standards. | [README](packages/server/README.md)        |
| [`invisit`](packages/cli)                | The installer: `npx invisit init` adds the tracker to a web project.                   | [README](packages/cli/README.md)           |
| [`apps/tracker`](apps/tracker)           | The tracker source. `invisit.js` and its optional chunks are built from it.            | Not published to npm                       |
| [`plugins/wordpress`](plugins/wordpress) | The WordPress plugin: adds the tracker to a WordPress site, with settings in wp-admin. | [readme.txt](plugins/wordpress/readme.txt) |

## Quick start

One command, in any web project:

```sh
npx invisit init --site <site id>
```

Or by hand, in the browser:

```sh
npm install @invisitdev/web
```

```ts
import { init } from '@invisitdev/web'

init({ site: '<site id>' })
```

Or with no build step at all:

```html
<script
  async
  src="https://api.invisit.dev/invisit.js"
  data-site="<site id>"
  data-collector="https://api.invisit.dev"
></script>
```

To serve the tracker from your own domain, record crawler reads or send events from your backend, add [`@invisitdev/server`](packages/server/README.md).

## Agent skills

Teach your coding agent to install invisit and read its numbers, with [`install-invisit`](skills/install-invisit/SKILL.md) and [`invisit-analytics`](skills/invisit-analytics/SKILL.md):

```sh
npx skills add berkinory/invisit-sdk
```

## Repository layout

```text
skills/               Agent Skills for coding agents
apps/tracker/         tracker source (TypeScript, no runtime dependencies)
packages/web/         @invisitdev/web
packages/server/      @invisitdev/server
packages/cli/         invisit, the installer CLI
plugins/wordpress/    the WordPress plugin (PHP, GPL-2.0-or-later)
scripts/              build scripts for the tracker and the packages
.github/workflows/    publish.yml: npm releases with provenance
```

## Building from source

Requires [Bun](https://bun.sh) (the exact version is pinned in `package.json` under `packageManager`).

```sh
git clone https://github.com/berkinory/invisit-sdk.git
cd invisit-sdk
bun install
bun run build
```

| Command                                     | Output                                              |
| ------------------------------------------- | --------------------------------------------------- |
| `bun run tracker:build`                     | `apps/tracker/bundle/`: `invisit.js` and its chunks |
| `bun run --filter @invisitdev/web build`    | `packages/web/dist/`                                |
| `bun run --filter @invisitdev/server build` | `packages/server/dist/`                             |
| `bun run --filter invisit build`            | `packages/cli/dist/`                                |
| `bun run build`                             | All of the above                                    |

The builds print each file's raw and gzipped size.

## How releases work

This repository is a **read-only mirror** of the SDK source in invisit's private monorepo. A commit lands here only after it has passed invisit's own CI (type checks, lint, unit and integration tests).

Publishing is automated by [`publish.yml`](.github/workflows/publish.yml):

1. A push to `main` checks each package's `package.json` version against npm.
2. A version npm does not have yet is built from this commit and published. Versions with a prerelease suffix (`1.2.0-beta.1`) go to the `next` dist-tag, all others to `latest`.
3. The commit is tagged `web-v<version>`, `server-v<version>` or `cli-v<version>`.

Releases use npm [trusted publishing](https://docs.npmjs.com/trusted-publishers) over OIDC. No npm token exists anywhere, and every version carries a signed [provenance statement](https://docs.npmjs.com/generating-provenance-statements) linking it to the exact commit and workflow run that built it.

### Verifying a release

```sh
# in a project that depends on the packages
npm audit signatures
```

Or open the package on npmjs.com and follow the **Provenance** section at the bottom of the page to the source commit and build log.

## Contributing

Pull requests can't be merged here, since the next mirror sync would overwrite them. Bug reports, questions and suggestions are welcome at [help@invisit.dev](mailto:help@invisit.dev); fixes land through the private repository and show up here with the next sync.

## Security

Please report vulnerabilities privately to [help@invisit.dev](mailto:help@invisit.dev), not in a public issue.

## License

[MIT](LICENSE), except `plugins/wordpress`, which is GPL-2.0-or-later as WordPress.org requires
([its LICENSE](plugins/wordpress/LICENSE)).
