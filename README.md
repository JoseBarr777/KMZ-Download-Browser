# kmz-download-browser

A lightweight static browser for TxDOT KMZ/KML downloads.

Built with plain HTML, CSS, and JavaScript. No frameworks, no package manager, no build step.

## Data flow

```
current.json → manifest.json → download links
```

1. Fetch `current.json` from the artifact host.
2. Build the manifest URL from `release_prefix` + `manifest_path`.
3. Fetch `manifest.json` and render links to its artifacts.

Releases are discovered at runtime, so the frontend never hard-codes release IDs.

## Hosts

- Artifact host: https://files.kmz.josebarrera.cloud
- Frontend (planned, Cloudflare Pages): https://kmz.josebarrera.cloud

## Local preview

Open `index.html` directly, or serve the folder with any static file server.
