# @invisitdev/web

The invisit browser tracker as an ES module. It is the same tracker as the `invisit.js` script tag, built from the same source, typed, and safe to import during server rendering. Its optional parts (web vitals, no-code rules, the feedback widget, the heatmap overlay) are dynamic imports, so your bundler splits them into your own files: the page never requests `invisit*.js` from anywhere.

Nothing about the visit is stored on the device. Only a consent answer you set and the site owner's own opt-out are kept, and `storage: 'none'` keeps even those off.

## Install

```sh
npm install @invisitdev/web
```

## Start it

```ts
import { init } from '@invisitdev/web'

init({ site: '<site id>' })
```

Call `init()` once, in the browser, as early as your app allows. It sends the page view, follows client-side navigation on its own, and returns the tracker. Calling it again returns the same tracker (and warns when `debug` is on). It returns `undefined` on the server, while a site owner has the heatmap overlay open, for a browser that opted out with `#invisit-ignore`, or without a site.

If the `invisit.js` script tag already started invisit on the page, `init()` reuses that tracker and ignores its own options, so the two never count a visit twice.

| Option           | Default                   | Meaning                                                                          |
| ---------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `site`           | required                  | The site id, from Settings → Installation. Public and permanent.                 |
| `baseUrl`        | `https://api.invisit.dev` | Where the collector is: the cloud, or a first-party proxy path.                  |
| `debug`          | `false`                   | Logs delivery problems to the console.                                           |
| `storage`        | `'auto'`                  | `'none'` keeps nothing at all on the device.                                     |
| `outboundLinks`  | `true`                    | Records clicks on links to other sites.                                          |
| `fileDownloads`  | `true`                    | Records clicks on file downloads.                                                |
| `excludePaths`   | `[]`                      | Paths never measured: exact (`'/health'`) or a trailing wildcard (`'/admin/*'`). |
| `respectGpc`     | `true`                    | Stops measuring for browsers sending Global Privacy Control.                     |
| `respectDnt`     | `true`                    | Stops measuring for browsers sending Do Not Track.                               |
| `requireConsent` | `false`                   | Waits for `consent('granted')` before sending anything.                          |

## API

```ts
import { consent, feedback, flush, identify, sendFeedback, track } from '@invisitdev/web'

track('signup_started', { plan: 'growth' })
identify('customer-internal-id')
consent('granted') // or 'denied', 'unknown'
feedback() // opens the feedback widget, where the site has it on
await sendFeedback({ message: 'Love it', email: 'me@example.com' }) // true once the collector took it
flush() // sends what is queued now rather than in a moment
```

These forward to the running tracker. Calls made before `init()` wait and are applied once it starts, so an `identify()` in your auth code can run before the tracker does. `sendFeedback()` needs a running tracker and resolves to `false` without one. The tracker `init()` returns also has `conversion()`, `pageview()` and `stop()`.

## Server rendering

Importing the package touches no browser globals, and every function is a silent no-op where there is no `window` or `document`. You can import it anywhere; it only does something once `init()` runs in the browser.

## First-party proxies

Point `baseUrl` at a path on your own domain:

```ts
init({ site: '<site id>', baseUrl: '/_i' })
```

First-party proxying is covered by `@invisitdev/server`.

## Frameworks

No wrapper packages: call `init()` wherever your framework runs code once in the browser. Each example is what to add to the file your scaffold generated; keep the rest of it.

React (Vite), Solid, Vue or a plain bundled app: in the entry module (`src/main.tsx`, `src/index.tsx`, `src/main.ts`), before the first render or `app.mount()`, keeping your CSS import, router and other plugins.

```ts
import { init } from '@invisitdev/web'

init({ site: '<site id>' })
```

Next.js with the App Router: a client component, rendered in the root layout.

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

// app/layout.tsx: import it and render <Analytics /> inside <body>, keeping
// globals.css, the fonts and the metadata export
```

With the Pages Router, the same effect goes in `pages/_app.tsx`, next to its `globals.css` import.

React Router (and Remix): the effect goes in the default `App` export of `app/root.tsx`. Keep `Layout`, `links` and `ErrorBoundary`: `Layout` renders `<Scripts />`, without which the page never hydrates.

Nuxt, with a client-only plugin (Nuxt 4 reads `app/plugins/`; on Nuxt 3 the folder is `plugins/`):

```ts
// app/plugins/invisit.client.ts
import { init } from '@invisitdev/web'

export default defineNuxtPlugin(() => {
  init({ site: useRuntimeConfig().public.invisitSite })
})
```

SvelteKit 3, in the root layout (on SvelteKit 2, `browser` comes from `$app/environment`):

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

Astro, in a script in your base layout (Astro bundles it and runs it in the browser):

```astro
<script>
  import { init } from '@invisitdev/web'
  init({ site: import.meta.env.PUBLIC_INVISIT_SITE })
</script>
```

SolidStart, in the client entry before `mount()`:

```tsx
// src/entry-client.tsx
import { mount, StartClient } from '@solidjs/start/client'
import { init } from '@invisitdev/web'

init({ site: '<site id>' })

mount(() => <StartClient />, document.getElementById('app')!)
```

Gatsby, in `onClientEntry`:

```ts
// gatsby-browser.tsx
import type { GatsbyBrowser } from 'gatsby'
import { init } from '@invisitdev/web'

export const onClientEntry: GatsbyBrowser['onClientEntry'] = () => {
  init({ site: '<site id>' })
}
```

Docusaurus, as a client module (`clientModules: ['./src/invisit.ts']` in `docusaurus.config.ts`):

```ts
// src/invisit.ts
import { init } from '@invisitdev/web'

init({ site: '<site id>' })
```

VitePress, in the theme's `enhanceApp`, which also runs while the site is built:

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

Angular (19+), as an app initializer next to the providers the CLI generated:

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
    // with SSR, keep the provideClientHydration(…) the CLI added
    provideAppInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) init({ site: '<site id>' })
    }),
  ],
}
```

## License

MIT
