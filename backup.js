#!/usr/bin/env node
// Download every workflow from an n8n instance into a folder of JSON files.
//
// Usage: node backup.js [--out backup] [--source cloud|local]
//   --source cloud  (default) reads N8N_API_URL / N8N_API_KEY
//   --source local            reads N8N_LOCAL_API_URL / N8N_LOCAL_API_KEY
//
// One-way on purpose: instance -> disk. Credentials are configured in the n8n UI, so the live
// copy is the source of truth. Pushing a file back over a live workflow silently drops that wiring.
"use strict";

const fs = require("fs");
const path = require("path");
const { loadEnv, requireVars, importable, client, safeFileName } = require("./lib/n8n");

const args = process.argv.slice(2);
const opt = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const outDir = path.resolve(opt("--out", "backup"));
const source = opt("--source", "cloud");

(async () => {
  const env = loadEnv();
  const [urlVar, keyVar] = source === "local" ? ["N8N_LOCAL_API_URL", "N8N_LOCAL_API_KEY"] : ["N8N_API_URL", "N8N_API_KEY"];
  requireVars(env, [urlVar, keyVar]);
  const api = client(env[urlVar], env[keyVar]);

  const list = await api.listAll("workflows");
  fs.mkdirSync(outDir, { recursive: true });
  let nodes = 0;
  const failures = [];

  for (const summary of list) {
    try {
      const wf = await api.call("GET", `/api/v1/workflows/${summary.id}`);
      // Keep the id and active flag in the file name and body so a restore can tell twins apart.
      const file = `${safeFileName(wf.name)} [${wf.id}].json`;
      const body = { ...importable(wf), id: wf.id, active: wf.active, staticData: wf.staticData ?? null };
      fs.writeFileSync(path.join(outDir, file), JSON.stringify(body, null, 2) + "\n", "utf8");
      nodes += wf.nodes.length;
      console.log(`saved  ${file}  (${wf.nodes.length} nodes${wf.active ? ", ACTIVE" : ""})`);
    } catch (e) {
      // One broken workflow must not stop the rest from being saved.
      failures.push(`${summary.name}: ${e.message}`);
      console.log(`SKIP   ${summary.name}  (${e.message})`);
    }
  }

  console.log(`\nBacked up ${list.length - failures.length} of ${list.length} workflows (${nodes} nodes) to ${outDir}`);
  if (failures.length) process.exitCode = 1;
})().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
