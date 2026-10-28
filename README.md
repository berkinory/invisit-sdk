# invisit SDKs

The code that runs on your site and your server, published so you can read exactly what it does.

| Package                                 | What it is                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------- |
| [`@invisitdev/web`](packages/web)       | The browser tracker as an ES module.                                       |
| [`@invisitdev/server`](packages/server) | A first-party tracker proxy, crawler reads and server-side events.         |
| [`apps/tracker`](apps/tracker)          | The tracker source; `invisit.js` and its optional parts are built from it. |

This repository is a read-only mirror of the SDK source in invisit's private repository: every commit here is one that passed invisit's own CI. Releases to npm are built from this repository with [provenance](https://docs.npmjs.com/generating-provenance-statements), so each published version links to the commit it came from.

Bugs, questions and security reports: help@invisit.dev.

MIT licensed.
