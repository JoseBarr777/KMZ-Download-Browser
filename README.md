# kmz-download-browser

A lightweight static browser for TxDOT KMZ/KML downloads.

Built with plain HTML, CSS, and JavaScript. No frameworks, no package manager, no build step.

## What it does (Phase 2)

- Shows the active release ID and when it was promoted.
- Master KML download.
- District picker: the selected district's NetworkLink KML plus a list of its county KMZs.
- Administrative boundary KMZs (combined, district, county, city).
- File sizes next to each download, when the manifest provides them.
- Loading and error states, with a Retry button.

Districts, counties, and boundary files all come from the manifest. None are hard-coded.

## Data flow

```
current.json → manifest.json → download links
```

1. Fetch `https://files.kmz.josebarrera.cloud/current.json`.
2. Build the manifest URL from `release_prefix` + `manifest_path`.
3. Fetch `manifest.json` and group `artifacts` by `type` (and county KMZs by `district`).
4. Each download link is `BASE/` + `release_prefix` + `artifact.path`. The browser downloads the file directly; JavaScript never fetches KML/KMZ contents.

Releases are discovered at runtime, so the frontend never hard-codes release IDs. The artifact host is set once in `BASE` in `public/app.js`.

## Hosts and deployment

- Frontend (Cloudflare Workers Static Assets): https://kmz.josebarrera.cloud
- Artifact host (R2): https://files.kmz.josebarrera.cloud

Only `public/` is deployed (see `assets.directory` in `wrangler.jsonc`). R2 CORS allows `GET`/`HEAD` from the frontend origin only.

## Local preview

```sh
python3 -m http.server 8000 --directory public
```

Because R2 CORS only allows `https://kmz.josebarrera.cloud`, a local preview shows the "Unable to load current release." error unless you point `BASE` at a local mock of `current.json` and the manifest. On success, the browser console logs `[kmz]` lines confirming that `current.json` and `manifest.json` loaded and how many links were built.
