#!/usr/bin/env node
// Point every node that uses credential TYPE <type> at the matching login in the local n8n.
//
// Why: n8n Cloud cannot export credential secrets. Imported workflows still point at Cloud
// credential ids that don't exist locally. Recreate each login by hand once, then relink by type.
//
// Usage: node relink-credentials.js <credentialType> [--name "Exact local credential name"] [--dry]
// Example: node relink-credentials.js googlePalmApi --dry
// Refuses to guess when several local logins share a type and no --name is given.
"use strict";

const { loadEnv, requireVars, importable, client } = require("./lib/n8n");

const args = process.argv.slice(2);
const type = args[0];
const dry = args.includes("--dry");
const nameArg = args.includes("--name") ? args[args.indexOf("--name") + 1] : null;

if (!type || type.startsWith("--")) {
  console.error('Usage: node relink-credentials.js <credentialType> [--name "..."] [--dry]');
  process.exit(1);
}

(async () => {
  const env = loadEnv();
  requireVars(env, ["N8N_LOCAL_API_URL", "N8N_LOCAL_API_KEY"]);
  const api = client(env.N8N_LOCAL_API_URL, env.N8N_LOCAL_API_KEY);

  const creds = (await api.listAll("credentials")).filter((c) => c.type === type && (!nameArg || c.name === nameArg));
  if (creds.length !== 1) {
    console.error(`Need exactly one local credential of type ${type}; found ${creds.length}.${creds.length > 1 ? " Use --name." : ""}`);
    process.exit(1);
  }
  const target = { id: creds[0].id, name: creds[0].name };

  let workflows = 0;
  let nodes = 0;
  for (const summary of await api.listAll("workflows")) {
    const wf = await api.call("GET", `/api/v1/workflows/${summary.id}`);
    let hits = 0;
    for (const node of wf.nodes) {
      if (node.credentials && node.credentials[type]) {
        node.credentials[type] = target;
        hits++;
      }
    }
    if (!hits) continue;
    workflows++;
    nodes += hits;
    console.log(`${dry ? "WOULD " : ""}relink ${hits} node(s) in: ${wf.name}${wf.active ? " (ACTIVE)" : ""}`);
    if (!dry) await api.call("PUT", `/api/v1/workflows/${wf.id}`, importable(wf));
  }
  console.log(`\n${dry ? "Dry run: " : ""}${nodes} node(s) across ${workflows} workflow(s) -> "${target.name}"`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
