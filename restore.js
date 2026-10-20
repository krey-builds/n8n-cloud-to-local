#!/usr/bin/env node
// Import a folder of workflow JSON files into the local n8n. Every workflow arrives INACTIVE.
//
// Usage: node restore.js [--from backup] [--dry]
// Reads N8N_LOCAL_API_URL / N8N_LOCAL_API_KEY. Run it once: each run creates new copies.
"use strict";

const fs = require("fs");
const path = require("path");
const { loadEnv, requireVars, importable, client } = require("./lib/n8n");

const args = process.argv.slice(2);
const from = path.resolve(args.includes("--from") ? args[args.indexOf("--from") + 1] : "backup");
const dry = args.includes("--dry");

(async () => {
  const env = loadEnv();
  requireVars(env, ["N8N_LOCAL_API_URL", "N8N_LOCAL_API_KEY"]);
  const api = client(env.N8N_LOCAL_API_URL, env.N8N_LOCAL_API_KEY);

  const files = fs.readdirSync(from).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) throw new Error(`No .json files in ${from}`);

  const report = [];
  for (const file of files) {
    // PowerShell 5.1's ConvertFrom-Json rejects valid n8n exports; Node's parser is the one to trust.
    const wf = JSON.parse(fs.readFileSync(path.join(from, file), "utf8").replace(/^﻿/, ""));
    if (dry) {
      console.log(`WOULD import ${wf.name} (${wf.nodes.length} nodes)`);
      continue;
    }
    try {
      const created = await api.call("POST", "/api/v1/workflows", importable(wf));
      report.push({ name: wf.name, sourceId: wf.id ?? null, sourceActive: !!wf.active, localId: created.id, ok: true });
      console.log(`OK    ${wf.name}`);
    } catch (e) {
      report.push({ name: wf.name, sourceId: wf.id ?? null, ok: false, error: e.message });
      console.log(`FAIL  ${wf.name} -> ${e.message}`);
    }
  }

  if (!dry) {
    fs.writeFileSync("restore-report.json", JSON.stringify(report, null, 2) + "\n");
    const ok = report.filter((r) => r.ok).length;
    console.log(`\nImported ${ok} of ${report.length}. Mapping of old to new ids: restore-report.json`);
    const wasActive = report.filter((r) => r.sourceActive).map((r) => r.name);
    if (wasActive.length) console.log(`Were active at the source (switch on after relinking logins): ${wasActive.join(", ")}`);
    if (ok < report.length) process.exitCode = 1;
  }
})().catch((e) => {
  console.error(`FAILED: ${e.message}`);
  process.exit(1);
});
