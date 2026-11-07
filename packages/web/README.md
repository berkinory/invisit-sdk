# @invisitdev/web

[![npm version](https://img.shields.io/npm/v/@invisitdev/web?color=000&label=npm)](https://www.npmjs.com/package/@invisitdev/web)
[![provenance](https://img.shields.io/badge/provenance-signed-000)](https://www.npmjs.com/package/@invisitdev/web#provenance)
[![types](https://img.shields.io/npm/types/@invisitdev/web?color=000)](https://www.npmjs.com/package/@invisitdev/web)
[![license](https://img.shields.io/npm/l/@invisitdev/web?color=000)](https://github.com/berkinory/invisit-sdk/blob/main/packages/web/LICENSE)

Privacy-first analytics for any web framework. The [invisit](https://invisit.dev) browser tracker as a typed ES module.

```ts
import { init, track } from '@invisitdev/web'

init({ site: '<site id>' })
track('signup_started', { plan: 'growth' })
```

- **No cookies.** Nothing about the visit is stored on the device. Only a consent answer you set and the site owner's own opt-out are kept, and `storage: 'none'` keeps even those off.
- **SPA-aware.** Page views follow client-side navigation on their own, in every router.
- **SSR-safe.** Importing touches no browser globals; every function is a no-op on the server.
- **Small and split.** Optional parts (web vitals, no-code rules, the feedback widget, the heatmap overlay) are dynamic imports, so your bundler splits them into your own files. The page never requests `invisit*.js` from a third-party host.
- **Same tracker as the script tag.** Built from the same source as `invisit.js`, and it never counts a visit twice when both are on the page.

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API](#api)
- [Events and properties](#events-and-properties)
- [Privacy and consent](#privacy-and-consent)
- [Server-side rendering](#server-side-rendering)
- [First-party proxy](#first-party-proxy)
- [Framework guides](#framework-guides)
- [Script tag](#script-tag)
- [Browser support](#browser-support)
- [TypeScript](#typescript)
- [License](#license)

## Installation

```sh
npm install @invisitdev/web
# or
pnpm add @invisitdev/web
yarn add @invisitdev/web
bun add @invisitdev/web
```

## Quick start

Get your site id from **Settings → Installation** in the invisit dashboard, then call `init()` once, in the browser, as early as your app allows:

```ts
import { init } from '@invisitdev/web'

init({ site: '<site id>' })
```

That is the whole setup. `init()` sends the first page view, follows client-side navigation from then on, and returns the running [`Tracker`](#tracker).

The site id is public and permanent. It is safe to ship in client code and in `PUBLIC_` / `NEXT_PUBLIC_` environment variables.

## Configuration

```ts
init({
  site: '<site id>',
  requireConsent: true,
  excludePaths: ['/admin/*', '/health'],
})
```

| Option           | Type                | Default                   | Description                                                                                                   |
| ---------------- | ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `site`           | `string`            | **required**              | The site id, from Settings → Installation.                                                                    |
| `baseUrl`        | `string`            | `https://api.invisit.dev` | The collector: the invisit cloud, or a [first-party proxy](#first-party-proxy) path such as `'/_i'`.          |
| `debug`          | `boolean`           | `false`                   | Logs each delivery, why anything was refused, and repeated `init()` calls. Events still count.                |
| `storage`        | `'auto' \| 'none'`  | `'auto'`                  | `'none'` keeps nothing at all on the device, not even the consent answer.                                     |
| `outboundLinks`  | `boolean`           | `true`                    | Records clicks on links to other sites.                                                                       |
| `fileDownloads`  | `boolean`           | `true`                    | Records clicks on file downloads.                                                                             |
| `errors`         | `boolean`           | `false`                   | Reports uncaught errors to the Errors page. Report caught ones with `captureError(error)`.                    |
| `excludePaths`   | `readonly string[]` | `[]`                      | Paths never measured: exact (`'/health'`) or with a trailing wildcard (`'/admin/*'`).                         |
| `respectGpc`     | `boolean`           | `false`                   | Turned on, stops measuring for browsers that send [Global Privacy Control](https://globalprivacycontrol.org). |
| `respectDnt`     | `boolean`           | `false`                   | Turned on, stops measuring for browsers that send Do Not Track.                                               |
| `requireConsent` | `boolean`           | `false`                   | Sends nothing until [`consent('granted')`](#consentstate) is called.                                          |

Everything else (allowed domains, redacted query keys, web vitals, heatmaps, no-code rules, the feedback widget) is configured per site in the dashboard and fetched by the tracker at runtime. No redeploy needed.

## API

```ts
import {
  consent,
  feedback,
  flush,
  identify,
  init,
  sendFeedback,
  track,
  visitId,
} from '@invisitdev/web'
```

Every function except `init()` forwards to the running tracker. Calls made **before** `init()` are queued and applied once it starts, so an `identify()` in your auth code can safely run before the tracker does.

### `init(options)`

```ts
function init(options: InitOptions): Tracker | undefined
```

Starts the tracker once per page and returns it. Calling it again returns the same tracker (and warns when `debug` is on).

Returns `undefined`:

- on the server (no `window` or `document`),
- while a site owner has the heatmap overlay open,
- for a browser that [opted out](#opting-out-your-own-visits) with `#invisit-ignore`,
- without a `site`.

If the [`invisit.js` script tag](#script-tag) already started invisit on the page, `init()` reuses that tracker and ignores its own options.

### `track(name, properties?, options?)`

```ts
function track(name: string, properties?: Properties, options?: { actionId?: string }): void
```

Records a custom event. See [Events and properties](#events-and-properties) for naming rules and limits.

```ts
track('checkout_completed', { plan: 'pro', seats: 5, annual: true })
```

### `identify(externalUserId)`

```ts
function identify(externalUserId: string): void
```

Links the visitor to your own user id (up to 128 characters) once they sign in. The id is stored hashed. Never pass an email address or other personal data.

### `consent(state)`

```ts
function consent(state: 'granted' | 'denied' | 'unknown'): void
```

Records the visitor's consent answer, typically from your cookie banner. `'denied'` stops all collection. With `requireConsent: true`, nothing is sent until `'granted'`. The answer is remembered on the device unless `storage: 'none'`.

### `feedback()`

```ts
function feedback(): void
```

Opens the feedback widget, when the site has it enabled in the dashboard.

### `sendFeedback(message)`

```ts
function sendFeedback(input: { message: string; email?: string }): Promise<boolean>
```

Sends one message from your own feedback form. Resolves to `true` once the collector accepted it, and to `false` when there is no running tracker (on the server, or before `init()`).

```ts
const sent = await sendFeedback({ message: 'Love it', email: 'me@example.com' })
```

### `visitId()`

```ts
function visitId(): string | null
```

The current visit's id, to pass into a checkout as `invisit_visit_id` metadata so its revenue is attributed to this visit. It names the visit alone and changes with every visit. `null` on the server, before `init()`, before the collector has answered the first page view, after 30 idle minutes, or while nothing may be measured.

### `flush()`

```ts
function flush(): void
```

Sends queued events now instead of with the next batch. Useful right before a hard navigation you control.

### `Tracker`

The object `init()` returns has everything above, plus:

| Member                          | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| `conversion(name, properties?)` | Records a conversion, reported apart from ordinary events.                  |
| `pageview()`                    | Records a page view now. Only needed for navigation the tracker cannot see. |
| `stop()`                        | Stops the tracker and removes its listeners.                                |
| `version`                       | The tracker version.                                                        |

```ts
const tracker = init({ site: '<site id>' })
tracker?.conversion('trial_started', { plan: 'growth' })
```

## Events and properties

The tracker validates and cleans everything before it leaves the browser. Invalid input is dropped quietly, never thrown.

| Rule           | Limit                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Event name     | 1 to 64 characters, `A-Z a-z 0-9 _ . : -`, starting with a letter or digit. Invalid names drop the event.           |
| Property key   | 1 to 40 characters, `A-Z a-z 0-9 _ . -`, starting with a letter or `_`. Keys starting with `invisit_` are reserved. |
| Property value | `string`, finite `number`, `boolean` or `null`. Strings are cut at 256 characters. Other types are dropped.         |
| Properties     | At most 32 per event.                                                                                               |

To keep personal data out of your analytics by default:

- Property keys that look sensitive (`password`, `token`, `secret`, `session`, `email`, `phone`, `auth`, `credential`…) are dropped.
- Email addresses and long digit runs (phone and card numbers) in string values are replaced with `[redacted]`.
- Sensitive query parameters (`token`, `code`, `email`, `password`, `state`…, plus any you add in the dashboard) are stripped from recorded URLs, along with the fragment and credentials.

### Events without JavaScript

Any element can record an event on click, and any `<form>` on submit, with data attributes:

```html
<button data-invisit-event="pricing_cta" data-invisit-prop-plan="pro">Upgrade</button>

<form data-invisit-event="newsletter_signup">…</form>
```

`data-invisit-prop-<key>` attributes become string properties, under the same rules as above.

## Privacy and consent

invisit measures without cookies or device identifiers. When you do gate analytics behind consent:

```ts
import { consent, init } from '@invisitdev/web'

init({ site: '<site id>', requireConsent: true })

// later, from your consent banner
consent('granted')
```

Optionally, the tracker can also stop for browsers that send Global Privacy Control or Do Not Track: turn on `respectGpc` or `respectDnt`. Both are off unless you set them.

### Opting out your own visits

Open any page of your site with `#invisit-ignore` at the end of the URL to stop counting that browser. `#invisit-unignore` undoes it. The choice is kept on the device (unless `storage: 'none'`).

## Server-side rendering

Importing `@invisitdev/web` touches no browser globals, and every function is a silent no-op where there is no `window` or `document`. Import it from shared or server code freely: it only does something once `init()` runs in the browser.

## First-party proxy

Serve the collector from your own domain so blockers that match on third-party hosts leave it alone, and so the collector sees each visitor's real address instead of a shared one:

```ts
init({ site: '<site id>', baseUrl: '/_i' })
```

The proxy itself runs on your server with [`@invisitdev/server`](https://www.npmjs.com/package/@invisitdev/server), in one line for most frameworks.

## Framework guides

There are no wrapper packages: call `init()` wherever your framework runs code once in the browser. Each snippet shows only what to add to the file your scaffold generated; keep the rest of it.

<details>
<summary><strong>Vite (React, Vue, Svelte, Solid) or any bundled app</strong></summary>

In the entry module (`src/main.tsx`, `src/main.ts`, `src/index.tsx`), before the first render or `app.mount()`:

```ts
import { init } from '@invisitdev/web'

init({ site: '<site id>' })
```

</details>

<details>
<summary><strong>Next.js</strong></summary>

**App Router:** a client component, rendered inside `<body>` in the root layout.

```tsx
// app/analytics.tsx
'use client'
import { useEffect } from 'react'
import { init } from '@invisitdev/web'

export function Analytics() {
  useEffect(() => {
    init({ site: process.env.NEXT_PUBLIC_INVISIT_SITE! })
  }, [])
  return null
}
```

```tsx
// app/layout.tsx
import { Analytics } from './analytics'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
```

**Pages Router:** the same `useEffect` goes in `pages/_app.tsx`.

</details>

<details>
<summary><strong>TanStack Start</strong></summary>

A component that starts the tracker once it is in the browser, rendered beside `<Scripts />` in the `RootDocument` of `src/routes/__root.tsx`:

```tsx
// src/components/analytics.tsx
import { useEffect } from 'react'
import { init } from '@invisitdev/web'

export function Analytics() {
  useEffect(() => {
    init({ site: import.meta.env.VITE_INVISIT_SITE })
  }, [])
  return null
}
```

</details>

<details>
<summary><strong>React Router and Remix</strong></summary>

The same `useEffect` as for Next.js goes in the default `App` export of `app/root.tsx`. Keep `Layout`, `links` and `ErrorBoundary`: `Layout` renders `<Scripts />`, without which the page never hydrates.

</details>

<details>
<summary><strong>Nuxt</strong></summary>

A client-only plugin. Nuxt 4 reads `app/plugins/`; on Nuxt 3 the folder is `plugins/`.

```ts
// app/plugins/invisit.client.ts
import { init } from '@invisitdev/web'

export default defineNuxtPlugin(() => {
  init({ site: useRuntimeConfig().public.invisitSite })
})
```

</details>

<details>
<summary><strong>SvelteKit</strong></summary>

In the root layout. On SvelteKit 2, import `browser` from `$app/environment` instead.

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { browser } from '$app/env'
  import { init } from '@invisitdev/web'

  let { children } = $props()

  if (browser) init({ site: '<site id>' })
</script>

{@render children()}
```

</details>

<details>
<summary><strong>Waku</strong></summary>

A client component rendered by the root layout, `src/pages/_layout.tsx`. Client components only see variables named `WAKU_PUBLIC_*`.

```tsx
// src/components/analytics.tsx
'use client'
import { useEffect } from 'react'
import { init } from '@invisitdev/web'

export function Analytics() {
  useEffect(() => {
    init({ site: import.meta.env.WAKU_PUBLIC_INVISIT_SITE })
  }, [])
  return null
}
```

</details>

<details>
<summary><strong>Astro</strong></summary>

A `<script>` in your base layout. Astro bundles it and runs it in the browser.

```astro
<script>
  import { init } from '@invisitdev/web'
  init({ site: import.meta.env.PUBLIC_INVISIT_SITE })
</script>
```

</details>

<details>
<summary><strong>SolidStart</strong></summary>

```tsx
// src/entry-client.tsx
import { mount, StartClient } from '@solidjs/start/client'
import { init } from '@invisitdev/web'

init({ site: '<site id>' })

mount(() => <StartClient />, document.getElementById('app')!)
```

</details>

<details>
<summary><strong>Angular (19+)</strong></summary>

An app initializer, next to the providers the CLI generated. With SSR, keep the `provideClientHydration(…)` the CLI added.

```ts
// src/app/app.config.ts
import {
  ApplicationConfig,
  PLATFORM_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core'
import { isPlatformBrowser } from '@angular/common'
import { provideRouter } from '@angular/router'
import { init } from '@invisitdev/web'
import { routes } from './app.routes'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAppInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) init({ site: '<site id>' })
    }),
  ],
}
```

</details>

<details>
<summary><strong>Gatsby</strong></summary>

```ts
// gatsby-browser.tsx
import type { GatsbyBrowser } from 'gatsby'
import { init } from '@invisitdev/web'

export const onClientEntry: GatsbyBrowser['onClientEntry'] = () => {
  init({ site: '<site id>' })
}
```

</details>

<details>
<summary><strong>Docusaurus</strong></summary>

A client module, registered with `clientModules: ['./src/invisit.ts']` in `docusaurus.config.ts`:

```ts
// src/invisit.ts
import { init } from '@invisitdev/web'

init({ site: '<site id>' })
```

</details>

<details>
<summary><strong>VitePress</strong></summary>

In the theme's `enhanceApp`, which also runs during the build, hence the `inBrowser` guard:

```ts
// docs/.vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme'
import { inBrowser, type Theme } from 'vitepress'
import { init } from '@invisitdev/web'

export default {
  extends: DefaultTheme,
  enhanceApp() {
    if (inBrowser) init({ site: '<site id>' })
  },
} satisfies Theme
```

</details>

<details>
<summary><strong>WordPress</strong></summary>

Use the [script tag](#script-tag), printed into every page's head from your child theme's `functions.php`:

```php
// wp-content/themes/my-child-theme/functions.php
add_action('wp_head', function () {
    if (current_user_can('edit_posts')) {
        return; // leave out your own visits while you are signed in to edit the site
    }
    ?>
    <script async src="https://api.invisit.dev/invisit.js" data-site="<site id>" data-collector="https://api.invisit.dev"></script>
    <?php
});
```

</details>

## Script tag

Not using a bundler? The same tracker ships as a script, with no npm install:

```html
<script
  async
  src="https://api.invisit.dev/invisit.js"
  data-site="<site id>"
  data-collector="https://api.invisit.dev"
></script>
```

`data-collector` is the script's `baseUrl` and, unlike `init()`, has no default: without it, events go to your own origin. The other options map to `data-*` attributes too (`data-require-consent`, `data-storage="none"`, `data-exclude-paths="/admin/*,/health"`…). The dashboard's **Installation** page generates the exact snippet, including a version-pinned variant with Subresource Integrity hashes.

If a page has both the script tag and `init()`, the first one to start wins and the other reuses it.

## Browser support

The bundle targets Chrome 91, Edge 91, Firefox 90, Safari 15 and later.

## TypeScript

Types ship with the package. The public types are exported for your own wrappers:

```ts
import type {
  ConsentState,
  FeedbackMessage,
  InitOptions,
  Properties,
  Tracker,
} from '@invisitdev/web'
```

## Related

- [`@invisitdev/server`](https://www.npmjs.com/package/@invisitdev/server): first-party proxy, crawler analytics and server-side events.
- [Source](https://github.com/berkinory/invisit-sdk): every published version is built from this repository with npm provenance.

## Support

Questions, bugs and security reports: [help@invisit.dev](mailto:help@invisit.dev).

## License

[MIT](https://github.com/berkinory/invisit-sdk/blob/main/packages/web/LICENSE)
