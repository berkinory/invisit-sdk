# @invisitdev/server

## 0.4.1 (2026-11-10)

### Added

- Sends its version with every request, so the dashboard can tell you when an update matters.

## 0.4.0 (2026-11-04)

### Added

- `respectGpc` option in `createInvisit` leaves out events from visitors whose browser sends Global Privacy Control.

## 0.3.0 (2026-11-02)

### Added

- `track()` accepts a `visitor` object (`ip`, `userAgent`, `language`, `gpc`) instead of `request`, for work that runs without the visitor's request, such as queue consumers.
- `TrackVisitor` type export.

### Fixed

- Collector request timeouts work on runtimes without `AbortSignal.timeout`.

## 0.2.1 (2026-10-28)

### Changed

- Packaging only: the repository field points at the public SDK repository.

## 0.2.0 (2026-10-27)

### Breaking

- `key` must be an API key with the ingest scope (`invisit_sk_`); server keys (`invisit_ik_`) are rejected.

## 0.1.4 (2026-10-27)

### Changed

- Calls to the collector time out after 10 seconds.
- The proxy answers 413 to request bodies over 1 MiB.
- Crawler detection uses the `isbot` package, now a dependency, instead of a bundled copy.
- Both entry points export with the `default` condition, so `require()` resolves them.

## 0.1.3 (2026-10-26)

### Changed

- The default `baseUrl` is now `https://api.invisit.dev`.

## 0.1.2 (2026-10-26)

### Changed

- Packaging only: published with npm provenance.

## 0.1.1 (2026-10-26)

### Added

- `ip` option on `proxy()`, `handle()` and `track()` passes the visitor's address for servers with no edge proxy in front.

### Changed

- `createInvisit` throws a clear error when `key` is empty, which usually means the environment variable is not set.
- `onError` is told once when a proxied visitor arrives without an address.
- `crawlers()` records only GET and HEAD page reads, skipping static assets, RSC and prefetch requests and non-document fetches.
- `crawlers()` never reads the hostname from `X-Forwarded-Host`, and the Node adapter drops `X-Forwarded-Host` and `X-Forwarded-Proto` unless the proxy is trusted.
- `track()` rejects with `USER_AGENT_MISSING` when the request has no User-Agent.

### Fixed

- IPv4 visitors on dual-stack sockets (`::ffff:a.b.c.d`) are recognised as the same address.
- The Node `middleware` awaits `next`, so a `next` that returns a promise works.
- The Node `middleware` fails with `BODY_CONSUMED` when a body parser read the tracker request first, instead of silently forwarding an empty event.
- Logged errors are named `InvisitError` instead of a bundler-renamed class name.

## 0.1.0 (2026-10-26)

### Added

- First release, with `createInvisit` providing `proxy`, `handle`, `crawlers` and `track`, and a Node adapter at `@invisitdev/server/node`.
