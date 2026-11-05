# invisit on Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/berkinory/invisit-sdk/tree/main/templates/cloudflare-worker)

A Worker in front of any site, WordPress, Webflow and static hosts included, that gives
[invisit](https://invisit.dev) two things a script tag can't:

- **Crawler reads.** Every request from GPTBot, ClaudeBot, PerplexityBot, Googlebot and the rest,
  by page, in your dashboard's Crawlers report. Bots don't run JavaScript, so this is the only way
  to see them.
- **The tracker from your own domain**, under `/_i/`, so ad blockers that block third-party
  analytics don't drop your visits.

Everything else goes to your site unchanged, and if the Worker fails, the request falls through to
your site as if the Worker weren't there.

## Set up

1. Click **Deploy to Cloudflare** above. Cloudflare copies this folder into a repository of yours
   and deploys it.
2. When it asks for `INVISIT_API_KEY`, paste an ingest key of your site (invisit dashboard,
   Site settings, API keys).
3. Route the Worker to your domain: in Cloudflare, open the Worker, Settings, Domains & Routes,
   **Add route**, and enter `example.com/*` for your zone. Your domain has to be on Cloudflare.
4. Optional: serve the tracker through the Worker by changing your script tag to
   `<script defer src="/_i/invisit.js" data-site="<site id>" data-collector="/_i"></script>`.

Crawler reads show up within a minute of the first bot visit. Docs:
[invisit.dev/docs/server/frameworks#cloudflare-workers](https://invisit.dev/docs/server/frameworks#cloudflare-workers).
