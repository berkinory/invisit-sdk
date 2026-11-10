# @invisitdev/web

## 0.6.1 (2026-11-10)

### Changed

- Heartbeats stop after 5 minutes without input, so a tab left open no longer counts as an online visitor.
- A visitor who comes back after the visit lapsed starts a new visit with a page view of the page in front of them.
- Web vitals and other end-of-page measurements are timed at the visitor's last activity, not when the tab finally closes.

### Fixed

- FCP and LCP leave out paints that happen after the page was first hidden, so tabs opened in the background no longer report huge load times.
- Pages that never shift now report a CLS of 0 instead of no CLS at all.
- Referrers from Android apps (`android-app://`) are kept instead of being counted as direct traffic, with only the app package recorded.
- Script loads aborted by leaving the page are no longer reported as errors.

## 0.6.0 (2026-11-07)

### Added

- `errors` option in `init()` reports the page's uncaught errors and unhandled rejections; off unless set.
- `captureError(error)` export and `tracker.captureError()` report an error your own code caught, such as one stopped by an error boundary; needs `errors: true`.

## 0.5.0 (2026-11-06)

### Added

- Debug sessions: opening the site from a dashboard debug link shows an in-page panel listing each event and why any was refused, without the events reaching your reports.

### Changed

- With `debug: true`, every delivery is logged to the console along with the reason the collector refused anything.

## 0.4.1 (2026-11-05)

### Added

- `visitId()` export and `tracker.visitId()` return the current visit's id, to pass into a checkout as `invisit_visit_id` metadata for revenue attribution.

### Changed

- The short link click parameter `ivc` is removed from the address bar once the landing page view is sent.

## 0.4.0 (2026-11-04)

### Changed

- Events wait up to 3 seconds for the site's settings before going out, so a host the site does not allow sends nothing.

### Fixed

- `sdk_version` and `tracker.version` report the npm package's own version instead of the script tag tracker's.

## 0.3.1 (2026-11-04)

### Added

- `pageUrl` option in `init()` rewrites each page address before it is recorded, for example turning `/orders/8121` into `/orders/:id`.

### Fixed

- Pages whose path `pageUrl` rewrites no longer collect click heatmap data.

## 0.3.0 (2026-11-03)

### Changed

- Client-side page views wait up to 2 seconds for the router to set the new page title, so they carry the right title.
- Links to the site's own subdomains, parent domain or allowed domains are no longer counted as outbound.
- Browsers driven by automation (`navigator.webdriver`) send nothing unless `debug` is on.

### Fixed

- LCP, FCP and TTFB on prerendered pages are measured from when the page was shown, not from when it was prerendered.

## 0.2.1 (2026-10-28)

### Changed

- Packaging only: the repository field points at the public SDK repository.

## 0.2.0 (2026-10-27)

### Breaking

- The `key` option in `init()` is renamed to `site` and takes the site id.

## 0.1.4 (2026-10-27)

### Changed

- The package exports with the `default` condition, so `require()` resolves it.
- Option and function docs are JSDoc and show up in editors from `index.d.ts`.

### Fixed

- The feedback widget's Send button now disables while sending, so a message is no longer sent twice.
- Storage changes in other tabs only restart the tracker when they touch invisit's own keys.

## 0.1.3 (2026-10-26)

### Changed

- The default `baseUrl` is now `https://api.invisit.dev`.

## 0.1.2 (2026-10-26)

### Changed

- Packaging only: published with npm provenance.

## 0.1.1 (2026-10-26)

### Changed

- Documentation only: framework guides in the README.

## 0.1.0 (2026-10-26)

### Added

- First release of the invisit browser tracker as an ES module, with `init`, `track`, `identify`, `consent`, `feedback`, `sendFeedback` and `flush`.
