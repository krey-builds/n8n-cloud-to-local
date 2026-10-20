// Shared helpers: read .env without a dependency, talk to the n8n public API, keep only importable fields.
"use strict";

const fs = require("fs");
const path = require("path");

// The workflow settings the public API accepts on create/update. Anything else is rejected with 400.
const ALLOWED_SETTINGS = [
  "executionOrder",
  "saveDataErrorExecution",
  "saveDataSuccessExecution",
  "saveManualExecutions",
  "saveExecutionProgress",
  "executionTimeout",
  "timezone",
  "callerPolicy",
  "errorWorkflow",
];

/** Parse KEY=value lines. Trims whitespace and surrounding quotes: a trailing space in a key gives a 401 that looks exactly like a wrong key. */
function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

/** Real environment variables win over the .env file, so CI can inject secrets. */
function loadEnv(file = path.join(process.cwd(), ".env")) {
  const fromFile = fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {};
  return { ...fromFile, ...process.env };
}

function requireVars(env, names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(", ")}. Put them in .env (see .env.example) or the environment.`);
  }
}

function filterSettings(settings = {}) {
  return Object.fromEntries(Object.entries(settings).filter(([k]) => ALLOWED_SETTINGS.includes(k)));
}

/** The shape the API accepts for create/update, and the shape worth keeping in git. */
function importable(workflow) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: filterSettings(workflow.settings),
  };
}

/** Minimal n8n public API client. Never logs the key. */
function client(baseUrl, apiKey) {
  const base = String(baseUrl).replace(/\/+$/, "");
  async function call(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { "X-N8N-API-KEY": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${url} -> HTTP ${res.status} ${json.message || ""}`.trim());
    return json;
  }

  /** Follow nextCursor so accounts with more than one page of workflows are fully listed. */
  async function listAll(resource) {
    const items = [];
    let cursor = "";
    do {
      const page = await call("GET", `/api/v1/${resource}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      items.push(...(page.data || []));
      cursor = page.nextCursor || "";
    } while (cursor);
    return items;
  }

  return { call, listAll };
}

/** Workflow names become file names; keep them readable but safe on Windows. */
function safeFileName(name) {
  return String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").trim() || "untitled";
}

module.exports = { ALLOWED_SETTINGS, parseEnv, loadEnv, requireVars, filterSettings, importable, client, safeFileName };
