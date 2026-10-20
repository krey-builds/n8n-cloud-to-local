"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseEnv, filterSettings, importable, safeFileName, client } = require("../lib/n8n");

test("parseEnv trims spaces and quotes, skips comments", () => {
  const env = parseEnv('# comment\nN8N_API_KEY = "abc123"  \nN8N_API_URL=https://x.example.com/\r\nBAD LINE\n');
  assert.equal(env.N8N_API_KEY, "abc123");
  assert.equal(env.N8N_API_URL, "https://x.example.com/");
  assert.equal(Object.keys(env).length, 2);
});

test("filterSettings drops fields the public API rejects", () => {
  const out = filterSettings({ executionOrder: "v1", binaryMode: "separate", availableInMCP: true, timezone: "Asia/Kolkata" });
  assert.deepEqual(out, { executionOrder: "v1", timezone: "Asia/Kolkata" });
});

test("importable keeps only name, nodes, connections, settings", () => {
  const wf = { id: "1", name: "A", active: true, nodes: [], connections: {}, settings: { binaryMode: "x" }, tags: [] };
  assert.deepEqual(importable(wf), { name: "A", nodes: [], connections: {}, settings: {} });
});

test("safeFileName removes characters Windows rejects", () => {
  assert.equal(safeFileName('Ingest: Raw/Doc "v2"?'), "Ingest_ Raw_Doc _v2__");
  assert.equal(safeFileName(""), "untitled");
});

test("listAll follows nextCursor across pages", async () => {
  const pages = {
    "": { data: [{ id: "1" }, { id: "2" }], nextCursor: "abc" },
    abc: { data: [{ id: "3" }], nextCursor: null },
  };
  const seen = [];
  global.fetch = async (url, opts) => {
    assert.equal(opts.headers["X-N8N-API-KEY"], "k");
    const cursor = new URL(url).searchParams.get("cursor") || "";
    seen.push(cursor);
    return { ok: true, status: 200, json: async () => pages[cursor] };
  };
  const all = await client("https://n8n.example.com/", "k").listAll("workflows");
  assert.deepEqual(all.map((w) => w.id), ["1", "2", "3"]);
  assert.deepEqual(seen, ["", "abc"]);
});

test("API errors carry method, path and status but never the key", async () => {
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: "unauthorized" }) });
  await assert.rejects(client("https://n8n.example.com", "secret-key").call("GET", "/api/v1/workflows"), (e) => {
    assert.match(e.message, /GET \/api\/v1\/workflows -> HTTP 401 unauthorized/);
    assert.doesNotMatch(e.message, /secret-key/);
    return true;
  });
});
