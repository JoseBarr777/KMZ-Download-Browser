"use strict";

// Artifact/data host. The only place the host name appears.
const BASE = "https://files.kmz.josebarrera.cloud";
const CURRENT_URL = BASE + "/current.json";

// Administrative artifact types, in display order.
const ADMIN_TYPES = [
  "admin_boundaries_kmz",
  "district_boundaries_kmz",
  "county_boundaries_kmz",
  "city_boundaries_kmz",
];

const MESSAGES = {
  current: "Unable to load current release.",
  manifest: "Unable to load release manifest.",
  empty: "The release manifest contains no downloadable artifacts.",
};

// An error carrying a short message that is safe to show to users.
class LoadError extends Error {
  constructor(userMessage, detail, cause) {
    super(detail, cause ? { cause } : undefined);
    this.name = "LoadError";
    this.userMessage = userMessage;
  }
}

// ---------------------------------------------------------------------------
// URLs

function releaseUrl(current, path) {
  return BASE + "/" + current.release_prefix + path;
}

function manifestUrl(current) {
  return releaseUrl(current, current.manifest_path);
}

function artifactUrl(current, artifact) {
  return releaseUrl(current, artifact.path);
}

// ---------------------------------------------------------------------------
// Data loading and validation

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

async function fetchJson(url, userMessage, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    // fetch() rejects on network failures and CORS rejections alike.
    throw new LoadError(userMessage, "Network or CORS failure fetching " + url, err);
  }
  if (!response.ok) {
    throw new LoadError(userMessage, "HTTP " + response.status + " fetching " + url);
  }
  try {
    return await response.json();
  } catch (err) {
    throw new LoadError(userMessage, "Invalid JSON from " + url, err);
  }
}

function validateCurrent(current) {
  if (!current || typeof current !== "object") {
    throw new LoadError(MESSAGES.current, "current.json is not an object");
  }
  for (const field of ["release_id", "release_prefix", "manifest_path"]) {
    if (!isNonEmptyString(current[field])) {
      throw new LoadError(MESSAGES.current, "current.json is missing " + field);
    }
  }
  return current;
}

function validateManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.artifacts)) {
    throw new LoadError(MESSAGES.manifest, "manifest.artifacts is not an array");
  }
  return manifest;
}

async function loadRelease() {
  const current = validateCurrent(
    await fetchJson(CURRENT_URL, MESSAGES.current, { cache: "no-cache" })
  );
  console.info("[kmz] current.json loaded (CORS ok): release " + current.release_id);

  const url = manifestUrl(current);
  const manifest = validateManifest(await fetchJson(url, MESSAGES.manifest));
  console.info("[kmz] manifest.json loaded (CORS ok): " + manifest.artifacts.length + " artifacts from " + url);

  return { current, manifest };
}

// ---------------------------------------------------------------------------
// Artifact classification

function artifactLabel(artifact) {
  return artifact.display_name || artifact.county || artifact.district || artifact.path;
}

function compareText(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

// Returns { master, districts: [{ name, kml, counties }], admin, total }.
function classifyArtifacts(artifacts) {
  let master = null;
  const districtsByName = new Map();
  const admin = [];

  function district(name) {
    if (!districtsByName.has(name)) {
      districtsByName.set(name, { name, kml: null, counties: [] });
    }
    return districtsByName.get(name);
  }

  for (const artifact of artifacts) {
    if (!artifact || !isNonEmptyString(artifact.path)) {
      console.warn("[kmz] Skipping artifact without a path:", artifact);
      continue;
    }

    switch (artifact.type) {
      case "master_kml":
        if (master) {
          console.warn("[kmz] Multiple master_kml artifacts; using the first:", master.path);
        } else {
          master = artifact;
        }
        break;

      case "district_kml":
        if (isNonEmptyString(artifact.district)) {
          district(artifact.district).kml = artifact;
        } else {
          console.warn("[kmz] Skipping district_kml without district:", artifact.path);
        }
        break;

      case "county_kmz":
        if (isNonEmptyString(artifact.district)) {
          district(artifact.district).counties.push(artifact);
        } else {
          console.warn("[kmz] Skipping county_kmz without district:", artifact.path);
        }
        break;

      default:
        if (ADMIN_TYPES.includes(artifact.type)) {
          admin.push(artifact);
        } else {
          console.warn("[kmz] Ignoring unknown artifact type:", artifact.type, artifact.path);
        }
    }
  }

  const districts = [...districtsByName.values()].sort((a, b) => compareText(a.name, b.name));
  for (const d of districts) {
    d.counties.sort((a, b) =>
      compareText(a.county || artifactLabel(a), b.county || artifactLabel(b))
    );
  }
  admin.sort((a, b) => ADMIN_TYPES.indexOf(a.type) - ADMIN_TYPES.indexOf(b.type));

  const total =
    (master ? 1 : 0) +
    districts.reduce((n, d) => n + (d.kml ? 1 : 0) + d.counties.length, 0) +
    admin.length;

  return { master, districts, admin, total };
}

// ---------------------------------------------------------------------------
// Formatting

function formatBytes(bytes) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return value.toFixed(digits) + " " + units[unit];
}

function formatDate(iso) {
  const date = new Date(iso);
  if (!isNonEmptyString(iso) || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ---------------------------------------------------------------------------
// DOM helpers

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// An <a> styled as a button, pointing straight at the artifact on BASE.
// Content is wrapped in one span so flex layout keeps its inner spaces.
function downloadLink(current, artifact, ...content) {
  const link = el("a", "button");
  link.href = artifactUrl(current, artifact);
  const inner = el("span");
  inner.append(...content);
  link.append(inner);
  return link;
}

function sizeNode(artifact) {
  const size = formatBytes(artifact.size_bytes);
  return size ? el("span", "size", size) : null;
}

// The visually hidden label keeps repeated "Download KMZ" buttons
// distinguishable for screen-reader users.
function fileRow(current, artifact, label, fileKind) {
  const row = el("li", "file-row");
  row.append(el("span", "file-name", label));
  const size = sizeNode(artifact);
  if (size) row.append(size);
  const link = downloadLink(
    current, artifact, "Download ", el("span", "visually-hidden", label + " "), fileKind
  );
  link.classList.add("button-small");
  row.append(link);
  return row;
}

function singleDownload(container, current, artifact, text) {
  container.replaceChildren(downloadLink(current, artifact, text));
  const size = sizeNode(artifact);
  if (size) container.append(size);
}

// ---------------------------------------------------------------------------
// Rendering

let state = null;
let loading = false;

function showStatus(message, isError) {
  $("status").hidden = false;
  $("status").classList.toggle("is-error", isError);
  $("status-message").textContent = message;
  $("retry").hidden = !isError;
  $("browser").hidden = true;
}

function renderRelease(current) {
  $("release-id").textContent = current.release_id;
  const promoted = formatDate(current.promoted_at);
  $("release-promoted").textContent = promoted;
  $("release-promoted").dateTime = promoted ? current.promoted_at : "";
  $("release-promoted-row").hidden = !promoted;
  $("release-meta").hidden = false;

  $("footer-release-id").textContent = current.release_id;
  $("footer-release").hidden = false;
}

function renderMaster(current, master) {
  $("master-section").hidden = !master;
  if (master) {
    singleDownload($("master-download"), current, master, "Download Master KML");
  }
}

function renderDistrictOptions(districts) {
  const select = $("district-select");
  select.replaceChildren(...districts.map((d) => new Option(d.name, d.name)));
  select.value = districts[0].name;
}

function renderDistrict(name) {
  const { current, classified } = state;
  const district = classified.districts.find((d) => d.name === name);
  if (!district) return;

  const download = $("district-download");
  if (district.kml) {
    singleDownload(download, current, district.kml, "Download " + district.name + " District KML");
  } else {
    download.replaceChildren(el("p", "empty", "No district KML in this release."));
  }

  $("county-heading").textContent =
    "Counties in " + district.name + " (" + district.counties.length + ")";
  const list = $("county-list");
  if (district.counties.length) {
    list.replaceChildren(
      ...district.counties.map((c) => fileRow(current, c, artifactLabel(c), "KMZ"))
    );
  } else {
    list.replaceChildren(el("li", "file-row empty", "No county files in this release."));
  }
}

function renderAdmin(current, admin) {
  $("admin-section").hidden = admin.length === 0;
  $("admin-list").replaceChildren(
    ...admin.map((a) => fileRow(current, a, artifactLabel(a), "KMZ"))
  );
}

function render(current, classified) {
  state = { current, classified };

  renderRelease(current);
  renderMaster(current, classified.master);

  $("district-section").hidden = classified.districts.length === 0;
  if (classified.districts.length) {
    renderDistrictOptions(classified.districts);
    renderDistrict(classified.districts[0].name);
  }

  renderAdmin(current, classified.admin);

  $("status").hidden = true;
  $("browser").hidden = false;
}

// ---------------------------------------------------------------------------
// Startup

async function load() {
  if (loading) return;
  loading = true;
  showStatus("Loading current release…", false);

  try {
    const { current, manifest } = await loadRelease();
    const classified = classifyArtifacts(manifest.artifacts);
    if (classified.total === 0) {
      throw new LoadError(MESSAGES.empty, "No downloadable artifacts after classification");
    }
    render(current, classified);
    console.info(
      "[kmz] Constructed " + classified.total + " artifact links under " +
      releaseUrl(current, "") + " (" + classified.districts.length + " districts)"
    );
  } catch (err) {
    console.error("[kmz] Load failed:", err);
    showStatus(err instanceof LoadError ? err.userMessage : MESSAGES.current, true);
  } finally {
    loading = false;
  }
}

$("district-select").addEventListener("change", (event) => renderDistrict(event.target.value));
$("retry").addEventListener("click", load);

load();
