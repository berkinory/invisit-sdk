# @invisitdev/server

[![npm version](https://img.shields.io/npm/v/@invisitdev/server?color=000&label=npm)](https://www.npmjs.com/package/@invisitdev/server)
[![provenance](https://img.shields.io/badge/provenance-signed-000)](https://www.npmjs.com/package/@invisitdev/server#provenance)
[![types](https://img.shields.io/npm/types/@invisitdev/server?color=000)](https://www.npmjs.com/package/@invisitdev/server)
[![license](https://img.shields.io/npm/l/@invisitdev/server?color=000)](https://github.com/berkinory/invisit-sdk/blob/main/packages/server/LICENSE)

[invisit](https://invisit.dev) on your own server. One client, three jobs:

- **First-party proxy.** Serves the tracker and its endpoints from your own domain (`/_i/invisit.js`, `/_i/v1/events`…), so blockers that match on third-party hosts leave it alone. Each request is vouched for with your site's API key, so the collector uses the visitor's real address for identity, rate limits and location instead of your server's.
- **Crawler analytics.** Records reads by search engines, AI crawlers and link previews, which never run JavaScript.
- **Server-side events.** `track()` from a route handler, attributed to the visit the visitor's browser started.

Built on web-standard `Request`, `Response` and `fetch`, so the main entry runs unchanged on Node, Bun, Deno, Cloudflare Workers and Vercel or Netlify Edge, in any framework. `@invisitdev/server/node` adapts it to Node `http` servers (Express, Fastify, NestJS).

```ts
import { createInvisit } from '@invisitdev/server'

const invisit = createInvisit({ key: process.env.INVISIT_API_KEY! })

// in your middleware
const response = await invisit.handle(request)
if (response) return response
```

## Contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [API](#api)
- [Framework guides](#framework-guides)
- [Server-side events](#server-side-events)
- [Visitor address](#visitor-address)
- [Crawler reads](#crawler-reads)
- [Errors](#errors)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Installation

```sh
npm install @invisitdev/server
# or
pnpm add @invisitdev/server
yarn add @invisitdev/server
bun add @invisitdev/server
```

Requires Node 20 or later, or any runtime with `fetch` and Web Crypto. The only dependency is [`isbot`](https://www.npmjs.com/package/isbot), kept external so your app dedupes it and picks up its crawler patterns as they update.

## Quick start

### 1. Create an API key

In the invisit dashboard, open **Site settings → API keys** and create a key with **only the ingest scope**. It starts with `invisit_sk_`. Store it as a server-side environment variable:

```sh
INVISIT_API_KEY=invisit_sk_...
```

> [!WARNING]
> The API key is a secret. Never put it in client code or in a `PUBLIC_` / `NEXT_PUBLIC_` variable. An ingest-only key can send events for your site but never read them, which is why it should carry no other scope.

### 2. Create the client

```ts
// lib/invisit.ts
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: process.env.INVISIT_API_KEY! })
```

`createInvisit` throws a `TypeError` when the key is missing or empty (most often: the variable is not set where the code runs, such as a build step or a new deploy) and when it is not an `invisit_sk_` key, such as the public site id.

### 3. Add the middleware

Call `invisit.handle(request)` at the top of your middleware. It answers tracker requests under `/_i`, records crawler reads in the background, and resolves to `null` for everything else so your app answers it. See the [framework guides](#framework-guides) for your stack.

### 4. Point the browser at the proxy

With the script tag, load the tracker from the proxy path and send events to it:

```html
<script defer src="/_i/invisit.js" data-site="<site id>" data-collector="/_i"></script>
```

Or with [`@invisitdev/web`](https://www.npmjs.com/package/@invisitdev/web):

```ts
import { init } from '@invisitdev/web'

init({ site: '<site id>', baseUrl: '/_i' })
```

The site id is public. The API key never leaves your server.

## Configuration

```ts
createInvisit(options: InvisitOptions): Invisit
```

| Option       | Type                                   | Default                        | Description                                                                                                               |
| ------------ | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `key`        | `string`                               | **required**                   | An API key of the site with the ingest scope (`invisit_sk_…`).                                                            |
| `baseUrl`    | `string`                               | `https://api.invisit.dev`      | The collector. Leave it unless invisit support gives you another address.                                                 |
| `clientIp`   | `(request: Request) => string \| null` | [`clientIp`](#clientiprequest) | Reads the visitor's address from a request. See [Visitor address](#visitor-address).                                      |
| `fetch`      | `(input, init) => Promise<Response>`   | global `fetch`                 | The fetch used to reach the collector, e.g. for instrumentation.                                                          |
| `onError`    | `(error: unknown) => void`             | `console.error`                | Receives failures that are not thrown: proxy 502s, crawler hits not accepted, and `CLIENT_IP_UNRESOLVED` once per client. |
| `respectGpc` | `boolean`                              | `false`                        | Turned on, leaves out events of visitors whose browser sends Global Privacy Control.                                      |

Requests to the collector time out after 10 seconds, so a slow collector never holds your own response for long.

## API

### `invisit.handle(request, options?)`

```ts
handle(request: Request, options?: HandleOptions): Promise<Response | null>
```

The middleware one-liner. Proxies tracker requests and resolves to their `Response`. For every other request it records a crawler read in the background and resolves to `null`.

| Option      | Type                                  | Description                                                                                |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| `prefix`    | `string`                              | The path the tracker is served under. Default `'/_i'`.                                     |
| `ip`        | `string \| null`                      | The visitor's address for this request. Overrides `clientIp`.                              |
| `waitUntil` | `(promise: Promise<unknown>) => void` | Keeps the crawler hit alive after the response, e.g. `event.waitUntil` or `ctx.waitUntil`. |

Pass `waitUntil` wherever the platform has one, so a serverless function is not frozen before the hit is sent.

`handle` runs before your app, so crawler reads are recorded with status 200 whatever the page answered. When your framework lets middleware run after the page, use `proxy` and `crawlers` separately to record the real status.

### `invisit.proxy(request, options?)`

```ts
proxy(request: Request, options?: { prefix?: string; ip?: string | null }): Promise<Response | null>
```

Forwards a tracker request under `prefix` to the collector and resolves to its response, or to `null` for any other path. It never rejects:

| Situation                           | Response                               |
| ----------------------------------- | -------------------------------------- |
| Method other than GET, HEAD or POST | `405`                                  |
| Body larger than 1 MiB              | `413`                                  |
| Collector unreachable or timed out  | `502`, and the error goes to `onError` |

To serve the tracker under another path, pass `{ prefix: '/stats' }` and load `/stats/invisit.js` with `data-collector="/stats"`.

### `invisit.crawlers(request, options?)`

```ts
crawlers(request: Request, options?: { status?: number }): Promise<void>
```

Records the request as a crawler read when its user agent looks like one. `status` is what your server answered (default `200`). It never rejects; failures go to `onError`. See [Crawler reads](#crawler-reads) for what counts.

### `invisit.track(name, options)`

```ts
track(name: string, options: TrackOptions): Promise<{ accepted: number; duplicate: number }>
```

Sends a custom event for the visitor behind `options.request`, or for `options.visitor` when there is no request of theirs. Rejects with an [`InvisitError`](#errors). See [Server-side events](#server-side-events).

| Option       | Type                                                  | Description                                                                        |
| ------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `request`    | `Request`                                             | The visitor's own request: address, user agent, language and Sec-GPC.              |
| `visitor`    | `{ ip, userAgent, language?, gpc? }`                  | Instead of `request`, when only the visitor's details were kept.                   |
| `url`        | `string`                                              | The page the event belongs to.                                                     |
| `properties` | `Record<string, string \| number \| boolean \| null>` | Event properties, under the tracker's rules.                                       |
| `userId`     | `string`                                              | Your id for the signed-in user. Stored hashed, as with `identify` in the browser.  |
| `eventId`    | `string`                                              | A UUID v7. Reuse it when retrying so the event counts once. Generated when absent. |
| `ip`         | `string \| null`                                      | With `request`: the visitor's address when no header carries it.                   |

Pass `request` or `visitor`, never both.

### `clientIp(request)`

```ts
import { clientIp } from '@invisitdev/server'
```

The default address reader. See [Visitor address](#visitor-address).

### `@invisitdev/server/node`

Adapters for Node `http` (`IncomingMessage` / `ServerResponse`). The main entry stays free of `node:` imports so it loads on edge runtimes; these live in their own entry.

| Export                          | Description                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `middleware(invisit, options?)` | Express/Connect-style middleware: proxies tracker requests and records crawler reads with your app's real status once the response finishes.          |
| `toRequest(req, options?)`      | An `IncomingMessage` as a web `Request`. Reads the body of anything but GET and HEAD (up to 1 MiB), so only call it for requests you hand to invisit. |
| `sendResponse(res, response)`   | Writes a web `Response` to a `ServerResponse`, streaming its body with backpressure.                                                                  |

Both `middleware` and `toRequest` take `{ trustProxy?: boolean }`, and `middleware` also takes `{ prefix?: string }`. See [Visitor address](#visitor-address) for `trustProxy`.

## Framework guides

Every guide assumes the client from [step 2](#2-create-the-client) lives in `lib/invisit.ts` (or your framework's equivalent). Where no edge in front of your server sets the visitor's address in a header (a bare Bun, Deno or Node server), the guides pass it with `ip`.

<details>
<summary><strong>Next.js</strong></summary>

```ts
// proxy.ts (Next.js 16; before that, middleware.ts with `export async function middleware`)
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'
import { invisit } from './lib/invisit'

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await invisit.handle(request, { waitUntil: (p) => event.waitUntil(p) })
  return response ?? NextResponse.next()
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
```

If you already have a proxy (middleware) file, call `invisit.handle` at its top and return its response when there is one. It runs before the page renders, so crawler reads are recorded as 200.

</details>

<details>
<summary><strong>TanStack Start</strong></summary>

One global request middleware answers tracker requests and records crawler reads with each page's status. `src/start.ts` is not in the default template; create it beside `src/router.tsx`.

```ts
// src/start.ts
import { createMiddleware, createStart } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { invisit } from './lib/invisit'

const invisitMiddleware = createMiddleware().server(async ({ request, next }) => {
  const proxied = await invisit.proxy(request, { ip: getRequestIP() })
  if (proxied) return proxied
  const result = await next()
  void invisit.crawlers(request, { status: result.response.status })
  return result
})

export const startInstance = createStart(() => ({ requestMiddleware: [invisitMiddleware] }))
```

</details>

<details>
<summary><strong>Hono</strong></summary>

```ts
import { Hono } from 'hono'
import { getConnInfo } from 'hono/bun' // Node: '@hono/node-server/conninfo', Deno: 'hono/deno'
import { invisit } from './lib/invisit'

const app = new Hono()

app.use(async (c, next) => {
  const proxied = await invisit.proxy(c.req.raw, { ip: getConnInfo(c).remote.address })
  if (proxied) return proxied
  await next()
  void invisit.crawlers(c.req.raw, { status: c.res.status })
})
```

**Deno:** import `getConnInfo` from `hono/deno`, import the client with its extension (`./lib/invisit.ts`) and read the key with `Deno.env.get('INVISIT_API_KEY')!`.

**Cloudflare Workers:** read the key from the Worker's bindings, drop `getConnInfo` and `ip` (`CF-Connecting-IP` carries the visitor), and keep the crawler hit alive with `waitUntil`:

```ts
// src/lib/invisit.ts
import { env } from 'cloudflare:workers'
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: env.INVISIT_API_KEY })
```

```ts
c.executionCtx.waitUntil(invisit.crawlers(c.req.raw, { status: c.res.status }))
```

</details>

<details>
<summary><strong>Elysia</strong></summary>

```ts
import { Elysia } from 'elysia'
import { invisit } from './lib/invisit'

new Elysia()
  .onRequest(
    async ({ request, server }) =>
      (await invisit.handle(request, { ip: server?.requestIP(request)?.address })) ?? undefined,
  )
  .listen(3000)
```

`onRequest` runs before the route, so crawler reads are recorded as 200.

</details>

<details>
<summary><strong>Effect</strong></summary>

A global router middleware for `effect/http` (Effect 4), recording the status the visitor got, including the 404 a missing route becomes:

```ts
// src/invisit-middleware.ts
import { Effect, Exit, Option } from 'effect'
import { HttpRouter, HttpServerError, HttpServerRequest, HttpServerResponse } from 'effect/http'
import { invisit } from './lib/invisit'

export const InvisitMiddleware = HttpRouter.middleware(
  (app) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const ip = Option.getOrNull(request.remoteAddress)
      if (request.url.startsWith('/_i/')) {
        const web = yield* HttpServerRequest.toWeb(request)
        const proxied = yield* Effect.promise(() => invisit.proxy(web, { ip }))
        if (proxied) return HttpServerResponse.fromWeb(proxied)
      }
      return yield* app.pipe(
        Effect.onExit((exit) =>
          Effect.gen(function* () {
            const status = Exit.isSuccess(exit)
              ? exit.value.status
              : (yield* HttpServerError.causeResponse(exit.cause))[0].status
            const url = Option.getOrThrow(HttpServerRequest.toURL(request))
            const read = new Request(url, { method: request.method, headers: request.headers })
            void invisit.crawlers(read, { status })
          }),
        ),
      )
    }),
  { global: true },
)
```

Merge it into the layer you serve: `HttpRouter.serve(Layer.mergeAll(Routes, InvisitMiddleware))`.

</details>

<details>
<summary><strong>SvelteKit</strong></summary>

Written for SvelteKit 3. Declare the key in `src/env.ts` and import it from `$app/env/private`:

```ts
// src/env.ts
import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
  INVISIT_API_KEY: { description: 'An invisit API key with the ingest scope (invisit_sk_…)' },
})
```

```ts
// src/lib/server/invisit.ts
import { INVISIT_API_KEY } from '$app/env/private'
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: INVISIT_API_KEY })
```

```ts
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit/hooks'
import { invisit } from '#lib/server/invisit.ts'

export const handle: Handle = async ({ event, resolve }) => {
  const proxied = await invisit.proxy(event.request, { ip: event.getClientAddress() })
  if (proxied) return proxied
  const response = await resolve(event)
  if (!event.isDataRequest) void invisit.crawlers(event.request, { status: response.status })
  return response
}
```

The variable must be set at build time too, since the build validates it.

**SvelteKit 2:** import the key from `$env/static/private` (no `src/env.ts`), `Handle` from `@sveltejs/kit`, and the client from `$lib/server/invisit`.

**adapter-node:** the origin is taken as `https://<Host>`. Over plain HTTP, or behind a proxy that changes `Host`, set `kit.paths.origin` (SvelteKit 3; the `ORIGIN` environment variable on SvelteKit 2), or `PROTOCOL_HEADER` and `HOST_HEADER`. Otherwise SvelteKit's CSRF check answers the tracker's POSTs with a 403.

</details>

<details>
<summary><strong>Nuxt (Nitro)</strong></summary>

```ts
// nuxt.config.ts: filled from NUXT_INVISIT_API_KEY when the server starts
export default defineNuxtConfig({ runtimeConfig: { invisitApiKey: '' } })
```

```ts
// server/utils/invisit.ts
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: useRuntimeConfig().invisitApiKey })
```

```ts
// server/middleware/invisit.ts
import { invisit } from '../utils/invisit'

export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/_i/')) {
    const ip = getRequestIP(event, { xForwardedFor: true })
    return (await invisit.proxy(toWebRequest(event), { ip })) ?? undefined
  }
  // Nuxt's own asset and island requests are not page reads.
  if (event.method === 'GET' && !/^\/_{1,2}nuxt/.test(event.path)) {
    event.waitUntil(invisit.crawlers(toWebRequest(event)))
  }
})
```

The path check keeps `toWebRequest` away from your own routes' request bodies. The middleware runs before the page renders, so crawler reads are recorded as 200.

`getRequestIP(event, { xForwardedFor: true })` trusts `X-Forwarded-For`, which is only right behind a proxy that overwrites it. If visitors can reach the server directly, drop the option.

</details>

<details>
<summary><strong>Nitro 3</strong></summary>

```ts
// middleware/invisit.ts
import { defineHandler } from 'nitro'
import { getRequestIP } from 'nitro/h3'
import { invisit } from '../lib/invisit'

export default defineHandler(async (event) => {
  const proxied = await invisit.proxy(event.req, {
    ip: getRequestIP(event, { xForwardedFor: true }),
  })
  if (proxied) return proxied
  if (event.req.method === 'GET') event.waitUntil(invisit.crawlers(event.req))
})
```

`event.req` is already a web `Request`. Nitro middleware runs before the route, so crawler reads are recorded as 200. On Nitro 2, use the Nuxt guide above.

</details>

<details>
<summary><strong>Astro</strong></summary>

Needs on-demand rendering: an adapter, and `output: 'server'` (or `prerender = false` on the pages it covers).

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import node from '@astrojs/node'

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: { allowedDomains: [{ hostname: 'example.com', protocol: 'https' }] },
})
```

Without `security.allowedDomains` naming your public host, Astro's Node server builds every request URL on `localhost`, and POSTs whose `Origin` is your real domain (from browsers without `Sec-Fetch-Site`) get a CSRF 403.

```ts
// src/lib/invisit.ts
import { getSecret } from 'astro:env/server'
import { createInvisit } from '@invisitdev/server'

export const invisit = createInvisit({ key: getSecret('INVISIT_API_KEY')! })
```

```ts
// src/middleware.ts
import { defineMiddleware } from 'astro:middleware'
import { invisit } from './lib/invisit'

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next()
  const proxied = await invisit.proxy(context.request, { ip: context.clientAddress })
  if (proxied) return proxied
  const response = await next()
  void invisit.crawlers(context.request, { status: response.status })
  return response
})
```

</details>

<details>
<summary><strong>React Router and Remix</strong></summary>

A splat resource route, registered in `app/routes.ts`:

```ts
// app/routes.ts
import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  // … your other routes
  route('_i/*', 'routes/[_i].$.ts'),
] satisfies RouteConfig
```

```ts
// app/routes/[_i].$.ts
import { invisit } from '~/lib/invisit.server'

const proxy = async ({ request }: { request: Request }) =>
  (await invisit.proxy(request)) ?? new Response(null, { status: 404 })

export const loader = proxy
export const action = proxy
```

With `flatRoutes()` (file-system routes) the file name alone registers it; the brackets keep the leading underscore literal.

`react-router-serve` passes on no socket address. Put a proxy in front that sets `X-Forwarded-For` or `X-Real-IP`, or serve the app from your own Express server with `middleware(invisit)` from `@invisitdev/server/node`.

For crawler reads with the status the page got, run `npx react-router reveal entry.server` (`npx remix reveal entry.server` on Remix v2), then in `app/entry.server.tsx`:

```ts
export default function handleRequest(request: Request, responseStatusCode: number /* , … */) {
  void invisit.crawlers(request, { status: responseStatusCode })
  // … the existing rendering code
}
```

</details>

<details>
<summary><strong>SolidStart</strong></summary>

```ts
// src/middleware.ts, registered with solidStart({ middleware: 'src/middleware.ts' }) in
// vite.config.ts (app.config.ts on SolidStart 1)
import { createMiddleware } from '@solidjs/start/middleware'
import { invisit } from './lib/invisit'

export default createMiddleware([
  async (event, next) => {
    const proxied = await invisit.proxy(event.req, { ip: event.req.ip })
    if (proxied) return proxied
    const response = await next()
    // SolidStart's own /_build and /_server requests are not page reads.
    if (!event.url.pathname.startsWith('/_')) {
      void invisit.crawlers(event.req, { status: event.res.status ?? 200 })
    }
    return response
  },
])
```

Page renders resolve `next()` without a `Response`, so the status comes from `event.res.status`. In API routes, the visitor's address is `clientAddress` on the `APIEvent`.

</details>

<details>
<summary><strong>Waku</strong></summary>

Waku loads every file in `src/middleware` as Hono middleware:

```ts
// src/middleware/invisit.ts
import type { MiddlewareHandler } from 'hono'
import { invisit } from '../lib/invisit'

export default function invisitMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const proxied = await invisit.proxy(c.req.raw)
    if (proxied) return proxied
    await next()
    void invisit.crawlers(c.req.raw, { status: c.res.status })
  }
}
```

On a bare Node server with no edge in front, pass `ip: getConnInfo(c).remote.address` from `@hono/node-server/conninfo`.

</details>

<details>
<summary><strong>Cloudflare Workers</strong></summary>

```ts
import { createInvisit } from '@invisitdev/server'

export default {
  async fetch(request, env, ctx) {
    const invisit = createInvisit({ key: env.INVISIT_API_KEY })
    const proxied = await invisit.proxy(request)
    if (proxied) return proxied
    const response = await fetch(request) // your origin, or your app's own handler
    ctx.waitUntil(invisit.crawlers(request, { status: response.status }))
    return response
  },
} satisfies ExportedHandler<{ INVISIT_API_KEY: string }>
```

Set the key with `wrangler secret put INVISIT_API_KEY`.

</details>

<details>
<summary><strong>Convex</strong></summary>

Convex functions run on Convex's servers, so there is nothing to proxy. Send events from an action, with the visitor Convex saw:

```ts
// convex/analytics.ts
import { v } from 'convex/values'
import { createInvisit } from '@invisitdev/server'
import { action } from './_generated/server'

export const trackPurchase = action({
  args: { plan: v.string() },
  handler: async (ctx, { plan }) => {
    const { ip, userAgent } = await ctx.meta.getRequestMetadata()
    if (!ip || !userAgent) return // scheduled and cron runs have no visitor
    const invisit = createInvisit({ key: process.env.INVISIT_API_KEY! })
    await invisit
      .track('purchase', { visitor: { ip, userAgent }, properties: { plan } })
      .catch(console.error)
  },
})
```

Set the key with `npx convex env set INVISIT_API_KEY invisit_sk_…`. Mutations cannot call `fetch`: schedule an action from one and pass it the mutation's `ip` and `userAgent`.

</details>

<details>
<summary><strong>Express and Connect</strong></summary>

```ts
import express from 'express'
import { middleware } from '@invisitdev/server/node'
import { invisit } from './lib/invisit.js'

const app = express()
app.use(middleware(invisit)) // before body parsers: it reads tracker request bodies itself
app.use(express.json())
```

Tracker requests are answered from the collector. Every other request goes on to your app, and crawler reads are recorded once its response finishes, with the real status. `next` is awaited, so a `next` that returns a promise works too.

Register it **before any body parser**. If a parser ran first there is nothing left to forward, and the middleware fails the request with `next(error)` (code `BODY_CONSUMED`, status 500) rather than let the tracker's data vanish.

</details>

<details>
<summary><strong>NestJS</strong></summary>

With the Express platform, in `main.ts`, before any `app.useBodyParser()` and not in a module's `configure()`:

```ts
// src/main.ts
const app = await NestFactory.create(AppModule)
app.use(middleware(invisit))
```

With the Fastify platform, add the Fastify hook to its instance:

```ts
// src/main.ts
const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
const invisitMiddleware = middleware(invisit)
app
  .getHttpAdapter()
  .getInstance()
  .addHook('onRequest', async (request, reply) => {
    await invisitMiddleware(request.raw, reply.raw)
    if (reply.raw.headersSent) reply.hijack()
  })
```

</details>

<details>
<summary><strong>Fastify</strong></summary>

```ts
import Fastify from 'fastify'
import { middleware } from '@invisitdev/server/node'
import { invisit } from './lib/invisit.js'

const fastify = Fastify({ logger: true })
const invisitMiddleware = middleware(invisit)

fastify.addHook('onRequest', async (request, reply) => {
  await invisitMiddleware(request.raw, reply.raw)
  if (reply.raw.headersSent) reply.hijack()
})
```

Without `next`, the middleware answers tracker requests itself and lets everything else through; `headersSent` tells the hook which happened.

</details>

<details>
<summary><strong>Plain <code>node:http</code></strong></summary>

```ts
import { createServer } from 'node:http'
import { sendResponse, toRequest } from '@invisitdev/server/node'
import { invisit } from './lib/invisit.js'

createServer(async (req, res) => {
  if (req.url?.startsWith('/_i/')) {
    const response = await invisit.proxy(await toRequest(req))
    if (response) return sendResponse(res, response)
  }
  // … your app
})
```

`toRequest` reads the request body, so only call it for requests you hand to invisit.

</details>

## Server-side events

```ts
// app/api/checkout/route.ts (Next.js); any handler with the visitor's Request works
import { invisit } from '@/lib/invisit'

export async function POST(request: Request) {
  // … the purchase
  await invisit
    .track('purchase', {
      request,
      url: 'https://shop.example.com/checkout',
      properties: { plan: 'pro', amount: 49 },
      userId: user.id,
    })
    .catch(console.error) // a lost event must not fail the purchase
  return Response.json({ ok: true })
}
```

The visitor's address, user agent, `Accept-Language` and `Sec-GPC` come from `request`, so the event joins the visit their browser started. That means `request` must be **the visitor's own request**, sent from their browser through your server, not a webhook from a payment provider.

Where the address is not in a header, pass it as `ip`:

| Framework        | Visitor address                                      |
| ---------------- | ---------------------------------------------------- |
| Astro            | `context.clientAddress`                              |
| SvelteKit        | `event.getClientAddress()`                           |
| TanStack Start   | `getRequestIP()` from `@tanstack/react-start/server` |
| Nuxt, Nitro      | `getRequestIP(event, { xForwardedFor: true })`       |
| Hono             | `getConnInfo(c).remote.address`                      |
| Elysia           | `server?.requestIP(request)?.address`                |
| Effect           | `Option.getOrNull(request.remoteAddress)`            |
| SolidStart       | `clientAddress` on the `APIEvent`                    |
| Express, Fastify | Read from the socket by `toRequest(req)`             |

No request of the visitor's at hand, as in a background job or a Convex action? Pass what was kept of it instead:

```ts
await invisit.track('purchase', { visitor: { ip, userAgent }, properties: { plan: 'pro' } })
```

Behavior worth knowing:

- **Idempotency.** Every event gets a UUID v7 `event_id`. Pass your own `eventId` to make retries safe: the same id again is counted as a `duplicate`, not a second event.
- **Validation.** Names, properties and URLs follow the browser tracker's rules: event names up to 64 characters, up to 32 properties, string values up to 256 characters.
- **Bots and opt-outs.** A crawler user agent is answered with `{ accepted: 0 }`, exactly as in the browser. So is a visitor sending `Sec-GPC: 1`, when `createInvisit` has `respectGpc` on.
- **Never fail your route on analytics.** `track` rejects on any failure; always catch it where you call it. With Fastify, `.catch((error) => request.log.error(error))` keeps failures in your logs.

## Visitor address

The collector needs each visitor's real address to tell visitors apart, apply rate limits and resolve location. Behind your server, it would otherwise see only your server.

The default reader, `clientIp(request)`, checks these headers in order and uses the **first one present**:

1. `CF-Connecting-IP`
2. `X-Real-IP`
3. `Fly-Client-IP`
4. `True-Client-IP`
5. `X-Vercel-Forwarded-For`
6. `X-Forwarded-For` (first entry)

A malformed value gives `null` rather than falling through to a weaker header. A proxied request without an address then counts as coming from your server, and `onError` is told once (`CLIENT_IP_UNRESOLVED`) so the setup gap does not go unnoticed. IPv4-mapped IPv6 (`::ffff:203.0.113.7`) is reduced to the IPv4 address. An `ip` passed to `proxy`, `handle` or `track` always wins over the reader.

> [!IMPORTANT]
> These headers are only trustworthy when the platform in front of you sets or overwrites them, as Cloudflare, Vercel, Netlify and Fly do. If your server is reachable directly, or sits behind a proxy that appends to `X-Forwarded-For`, a visitor can write any address there. Pass your own reader:
>
> ```ts
> createInvisit({
>   key: process.env.INVISIT_API_KEY!,
>   clientIp: (request) => request.headers.get('x-my-edge-client-ip'),
> })
> ```

On Node, `toRequest` and `middleware` default to the socket's peer address and **drop** all address headers, along with `X-Forwarded-Proto` and `X-Forwarded-Host`. Pass `{ trustProxy: true }` when a proxy you run sets them.

## Crawler reads

`crawlers`, `handle` and the Node `middleware` record a request when all of these hold:

- the user agent looks like a crawler (per `isbot`; the collector classifies each hit again and drops false positives),
- the method is GET or HEAD,
- it is a document request, not a framework data request (RSC, prefetch) or a rendering crawler's subresource fetch,
- the path is not a static asset (`.css`, `.js`, images, fonts, source maps). `robots.txt` and sitemaps are kept.

The hostname comes from `request.url`. Only when that is a bind address (`localhost`, `127.x`, `::1`, `0.0.0.0`, `::`) is the `Host` header used. `X-Forwarded-Host` is never read here, since a visitor can write it: an adapter that trusts your proxy has already folded it into `request.url`.

## Errors

`track` rejects with an `InvisitError`. `proxy`, `handle` and `crawlers` never reject; their failures go to `onError`.

```ts
import { InvisitError } from '@invisitdev/server'

try {
  await invisit.track('purchase', { request })
} catch (error) {
  if (error instanceof InvisitError && error.code === 'RATE_LIMITED') {
    // back off
  }
}
```

| Property    | Type                      | Description                                                     |
| ----------- | ------------------------- | --------------------------------------------------------------- |
| `code`      | `string`                  | A stable, machine-readable code (below).                        |
| `message`   | `string`                  | A human-readable explanation.                                   |
| `status`    | `number \| null`          | The collector's HTTP status, `null` when there was no response. |
| `requestId` | `string \| null`          | The collector's request id. Quote it in support requests.       |
| `details`   | `Record<string, unknown>` | Extra context from the collector, such as validation details.   |

The most common codes:

| Code                   | Raised when                                                                     |
| ---------------------- | ------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`    | The collector rejected the event's shape or values.                             |
| `UNAUTHENTICATED`      | The API key is wrong, revoked, or lacks the ingest scope.                       |
| `RATE_LIMITED`         | Too many requests. Retry later.                                                 |
| `NETWORK_ERROR`        | The collector could not be reached or timed out. The cause is in `error.cause`. |
| `CLIENT_IP_UNRESOLVED` | No visitor address could be read. Pass `ip`, or a `clientIp` reader.            |
| `USER_AGENT_MISSING`   | The request has no `User-Agent` header.                                         |
| `HTTP_<status>`        | The collector answered with an error and no recognizable body.                  |

The Node adapter adds `BODY_CONSUMED` (a body parser ran first) and `PAYLOAD_TOO_LARGE` (body over 1 MiB).

## Security

- **The API key stays on your server.** It authenticates your server to the collector and is never included in a proxied response.
- **The proxy forwards only what the collector reads:** user agent, language, origin, referer, Sec-Fetch and client hints. Cookies, `Authorization` and `Host` stay on your side, and `Set-Cookie` from upstream is dropped.
- **The proxy is narrow.** Only tracker paths under the prefix are forwarded, only with GET, HEAD and POST, and bodies are capped at 1 MiB. Everything else is left to your app.
- **Address headers are not trusted blindly** on Node unless you opt in with `trustProxy`. On other runtimes, see [Visitor address](#visitor-address).

Report vulnerabilities privately to [help@invisit.dev](mailto:help@invisit.dev).

## Troubleshooting

**`createInvisit: no key given. Is INVISIT_API_KEY set where this runs?`**
The environment variable is missing where the code runs. Check build steps, preview deploys and the runtime's secret store (`wrangler secret put`, your host's dashboard).

**`createInvisit: key must be an API key with the ingest scope`**
You passed the site id. The server needs an `invisit_sk_…` API key; the site id belongs in the browser.

**`CLIENT_IP_UNRESOLVED` in your logs**
No edge in front of your server sets an address header. Pass `ip` from your framework (see the [table](#server-side-events)), or a `clientIp` reader.

**Tracker POSTs get a 403**
Your framework's CSRF check rejects them. See the SvelteKit (`origin`) and Astro (`security.allowedDomains`) guides.

**Express answers tracker requests with a 500 (`BODY_CONSUMED`)**
A body parser ran before `middleware(invisit)`. Register invisit first.

**Crawler reads all show status 200**
You are using `handle`, which runs before the page. Use `proxy` before and `crawlers(request, { status })` after your app, as in the Hono or Astro guides.

## Related

- [`@invisitdev/web`](https://www.npmjs.com/package/@invisitdev/web): the browser tracker as an ES module.
- [Source](https://github.com/berkinory/invisit-sdk): every published version is built from this repository with npm provenance.

## Support

Questions and bugs: [help@invisit.dev](mailto:help@invisit.dev).

## License

[MIT](https://github.com/berkinory/invisit-sdk/blob/main/packages/server/LICENSE)
