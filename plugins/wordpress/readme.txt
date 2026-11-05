=== invisit ===
Contributors: invisit
Tags: analytics, web analytics, privacy, cookieless, statistics
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Cookieless web analytics from invisit. Adds the tracker to your pages and keeps your own team out of the numbers.

== Description ==

This plugin connects your WordPress site to [invisit](https://invisit.dev), a hosted analytics service that counts visitors without cookies. You paste one site ID, and every front-end page loads the invisit tracker. Your numbers show up in the invisit dashboard, not in wp-admin.

What it does:

* Loads the tracker the way WordPress expects: enqueued, `async`, in the page head, through `wp_enqueue_script()`.
* Leaves out signed-in administrators and editors by default. You choose which roles, so customers and members who sign in can still be counted.
* Lets you turn on Global Privacy Control and Do Not Track, wait for consent, keep nothing on the visitor's device, stop recording outbound link and download clicks, and list paths that are never measured.
* Adds `data-cfasync="false"` to the tag, so Cloudflare Rocket Loader and LiteSpeed Cache leave it alone.

What it does not do: it keeps no analytics in your database, adds no dashboard widget, and makes no requests from wp-admin. It stores no API key. Everything beyond the options above, such as allowed domains, redacted query parameters, heatmaps and the feedback widget, is set per site in the invisit dashboard and picked up by the tracker on its own.

You need an invisit account. There is a free plan up to 20,000 events a month; see [pricing](https://invisit.dev/pricing).

== External services ==

This plugin is the WordPress side of invisit, a hosted analytics service run by invisit. Without the service it does nothing.

Once you save a site ID, every front-end page your visitors open (except for the signed-in roles you leave out) loads the tracker script from `https://api.invisit.dev/invisit.js`. From then on the visitor's browser sends to `https://api.invisit.dev`:

* page views: the page address with sensitive query parameters removed, the page title and the referrer
* time spent and scroll depth on the page, and page speed measurements (web vitals)
* clicks on outbound links and file downloads, unless you turn those off
* a short heartbeat while the page is open, for the realtime view
* clicks for heatmaps and feedback messages, only if you turn those on in the invisit dashboard

Like any web request, these carry the visitor's IP address and browser user agent. invisit uses the IP address to tell visits apart for a day and to look up an approximate location, and does not store it with the analytics. The tracker sets no cookies. With "Wait for consent" on, nothing is sent until your consent tool grants it, and with Global Privacy Control or Do Not Track respected, those browsers send nothing at all.

The plugin itself sends nothing from your server and makes no request from wp-admin. Your site ID is public and appears in your page source.

* invisit Terms of Service: https://invisit.dev/legal/terms
* invisit Privacy Policy: https://invisit.dev/legal/privacy
* Data Processing Agreement: https://invisit.dev/legal/dpa

Depending on where your visitors are, you may need to mention invisit in your own privacy policy.

== Installation ==

1. Install and activate the plugin from Plugins, Add New, or upload the zip.
2. Create a site in the [invisit dashboard](https://app.invisit.dev) and copy its site ID from Settings, Installation.
3. In WordPress, open Settings, invisit, paste the site ID and save.
4. Open your site in a private window and check the Realtime view in invisit. Your visit should show up within a few seconds.

== Frequently Asked Questions ==

= Does invisit use cookies? =

No. Visits are told apart with a hash that changes every day, so a visitor cannot be followed from one day to the next. The tracker only keeps a consent answer or your own opt-out on the device, and "Keep nothing on the visitor's device" turns even that off.

= I am signed in and see no tracker in the page source. Is it broken? =

Probably not. Administrators and editors get no tracker by default. Check from a private window, or untick your role under Settings, invisit.

= My caching plugin serves the same page to everyone. Are my editors counted? =

The role check runs when WordPress builds the page. Most caching plugins never serve cached pages to signed-in users, so it keeps working. A cache that does, such as Cloudflare's Cache Everything, serves your editors the cached page with the tracker in it. Open the site once in each browser you use with `#invisit-ignore` at the end of the address, and that browser stops being counted.

= Page views are missing since I turned on an optimisation plugin. =

Delaying JavaScript until the visitor interacts, or combining the tracker into a bundle with other scripts, loses page views. Exclude `invisit.js` from "delay JavaScript" and "combine JavaScript" in WP Rocket, LiteSpeed Cache or Perfmatters, then clear every cache.

= Can I serve the tracker from my own domain? =

Not with this plugin yet. To count visitors correctly, a proxy has to tell invisit each visitor's real address, and invisit only accepts that from a proxy that signs it with a secret API key. This first version stores no secrets, so it loads the tracker from api.invisit.dev. The invisit docs show how to put a Cloudflare Worker in front of your site instead.

= Can I record custom events or WooCommerce orders? =

Clicks on any element become events with a `data-invisit-event` attribute, which you can add in a Custom HTML block. In your own code, call `window.invisit.track()` once the tracker has loaded. See the [events guide](https://invisit.dev/docs/guides/events).

= What happens to my data when I delete the plugin? =

Deleting the plugin removes its settings from WordPress. Analytics already collected stay in your invisit account until you delete the site there.

== Changelog ==

= 1.0.0 =
* First release: site ID, excluded roles, privacy and click options, excluded paths.
