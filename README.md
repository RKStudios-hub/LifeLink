# LifeLink — Emergency Healthcare Assistant

Mobile-first, offline-capable web app that helps people in Lucknow find nearby
hospitals fast: GPS/manual location, 81-hospital directory with search and
filters, Leaflet/OpenStreetMap map, OSRM road routes, blood/document checklists,
and a settings screen. Plain HTML/CSS/JS — no build step, no framework.

## Run it

Any static file server works:

```bash
python -m http.server 8777          # then open http://127.0.0.1:8777
# or: npx serve .
```

Opening `index.html` directly from disk (`file://`) also works — the dataset is
embedded in `js/data.js` as a fallback for when `fetch()` is blocked.

## Features

- **First launch** — welcome screen → location permission choice (Allow /
  Choose on map / Not now). "Not now" never blocks any feature.
- **Home** — quick actions (hospitals, map, blood, documents, about),
  saved-location strip, emergency helpline 108.
- **Hospitals** — live search (name/area/doctor), filters (ICU, ambulance,
  blood bank, 24/7), distance sorting when a location is set, result count.
- **Hospital detail** — contact, services, beds/ICU/ambulance, blood stock
  (labelled demo data), required documents, call + route buttons.
- **Map** — 81 pins, user marker, tap-a-pin bottom sheet, drop-a-pin manual
  location picker, map style toggle, works without GPS.
- **Route** — OSRM road distance/time with an offline straight-line fallback
  (never blanks out), start-navigation hands off to Google Maps / native maps.
- **Offline** — service-worker precached app shell, cached same-origin assets,
  offline banner, hospital details/list/settings fully usable with no network.
- **About / Settings** — project info, disclaimers, data version, clear cache,
  change/remove location.

## Project structure

```
index.html            app shell (header, screen, bottom nav, modals, toasts)
manifest.webmanifest  PWA manifest
sw.js                 service worker (offline-first shell)
css/styles.css        design system (mobile-first, one stylesheet)
js/util.js            helpers: storage, DOM, toast, modal, geolocation, format
js/data.js            embedded hospital dataset (generated — do not edit)
js/map.js             Leaflet wrappers: map, pins, user marker, OSRM routes
js/screens.js         all screen renderers
js/app.js             controller: routing, actions, location, settings
data/hospitals.json   canonical dataset (generated)
icons/, vendor/       icons, Leaflet 1.9.4, self-hosted fonts (offline)
tools/                data build, packaging and test scripts
```

## Data

`data/hospitals.json` and `js/data.js` are generated from the original
Lucknow hospital dataset (81 hospitals, 630 doctors):

```bash
node tools/build-data.mjs     # source: tools/hospitals.csv
```

Every field (name, address, phone, coordinates, ratings, beds, ICU,
ambulance, blood stock) comes from that dataset — nothing is invented.
Blood stock and document lists are explicitly labelled as demo/verification
information in the UI, and disease statistics are intentionally excluded.

## Tests

```bash
python -m http.server 8777     # in one terminal
node tools/cdp-test.mjs        # 60+ checks: flows, map, routes, PWA, offline
node tools/file-check.mjs      # boots from file:// with embedded data
powershell -File tools/test-dom.ps1   # DOM snapshot assertions per screen
```

`cdp-test.mjs` drives headless Edge over CDP (first-launch flow, GPS via
geolocation override, search/filters, detail, OSRM route, map pins, manual
pin-drop, offline reload from cache, icon/overflow/touch-target checks).
Screenshots land in `%TEMP%\lifelink-shots`.

## Install as a PWA

Serve over HTTPS (or localhost) — browsers offer "Install app" from the
manifest (standalone display, 192/512 icons, offline shell).

## Build an Android APK with Capacitor

Requires Node 18+ and Android Studio (for the SDK).

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/browser
npx cap init "LifeLink" com.rkstudios.lifelink --web-dir www
npx cap add android
node tools/make-www.mjs         # copies only app files into www/
npx cap sync android
npx cap open android            # then Build > Build APK(s) in Android Studio
```

Notes:

- `tools/make-www.mjs` keeps tests/tools out of the APK.
- `@capacitor/browser` is optional but recommended: `js/util.js` already uses
  `Capacitor.Plugins.Browser.open()` for the "Start navigation", GitHub and
  OpenStreetMap links, falling back to `window.open` on the web.
- Add location permissions to
  `android/app/src/main/AndroidManifest.xml`:

  ```xml
  <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
  <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
  ```

  (INTERNET is added by Capacitor automatically; `tel:` dialing needs no
  permission because it uses the dialer intent.)
- Recommended `capacitor.config.json`:

  ```json
  {
    "appId": "com.rkstudios.lifelink",
    "appName": "LifeLink",
    "webDir": "www",
    "server": { "androidScheme": "https" }
  }
  ```

- Service-worker registration is harmless inside Capacitor: on origins where
  it is not allowed it fails silently (`.catch`) and the app still runs fully
  offline because every asset ships inside the APK.

## Internet-dependent parts

- **OSM tiles** and **OSRM routing** need a connection. Without one the map
  shows its offline notice and the route screen falls back to a straight-line
  estimate — everything else keeps working.
- Hospital directory, search, filters, detail, documents and distances are
  computed locally and never need the network.

## Disclaimer

LifeLink is an information/discovery aid, not a medical service. Verify blood
availability and admission requirements directly with the hospital. Emergency
helpline: **108**.
