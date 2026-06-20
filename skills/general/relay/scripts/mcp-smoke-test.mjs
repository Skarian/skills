#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { readServiceRuntime, writeServiceRuntime } from "../src/runtime.mjs";
import { startRelayServer } from "../src/server.mjs";
import { RelayStore, relayDbPath } from "../src/store.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mcpPath = path.resolve(__dirname, "..", "bin", "relay-mcp.mjs");

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function timeout(ms) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(Symbol.for("timeout")), ms);
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createMcp(env) {
  const child = spawn(process.execPath, [mcpPath], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const rl = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  let nextId = 1;
  let stderr = "";
  rl.on("line", (line) => {
    const message = JSON.parse(line);
    const resolver = pending.get(message.id);
    if (resolver) {
      pending.delete(message.id);
      resolver(message);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  return {
    child,
    get stderr() {
      return stderr;
    },
    send(method, params = {}) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return new Promise((resolve) => {
        pending.set(id, resolve);
      });
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    async close() {
      child.stdin.end();
      child.kill();
      await new Promise((resolve) => {
        child.once("exit", resolve);
        setTimeout(resolve, 1000);
      });
    },
  };
}

async function waitForExit(child, ms = 3000) {
  const result = await Promise.race([
    new Promise((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    }),
    timeout(ms),
  ]);
  if (result === Symbol.for("timeout")) {
    child.kill();
    throw new Error("MCP process did not exit");
  }
  return result;
}

async function startMcpExpectFailure(env) {
  const child = spawn(process.execPath, [mcpPath], {
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  const exit = await waitForExit(child);
  assert.notEqual(exit.code, 0);
  return { exit, stderr };
}

async function waitForHealthDown(port) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}/api/health`);
    } catch {
      return;
    }
    await delay(50);
  }
  throw new Error("Relay HTTP service stayed alive after MCP close");
}

async function post(port, pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

const root = await mkdtemp(path.join(os.tmpdir(), "relay-mcp-smoke-"));
const port = await freePort();
const env = { ...process.env, RELAY_DATA_DIR: root, RELAY_PORT: String(port) };
const stalePort = await freePort();
writeServiceRuntime({
  root,
  url: `http://127.0.0.1:${stalePort}/`,
  host: "127.0.0.1",
  port: stalePort,
  pid: 1,
  dbPath: relayDbPath(root),
});
const mcp = createMcp(env);
const store = new RelayStore({ root });
let mcpClosed = false;

try {
  const initialized = await mcp.send("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "relay-smoke", version: "0.0.0" },
  });
  assert.equal(initialized.result.serverInfo.name, "relay");
  mcp.notify("notifications/initialized");
  const health = await fetch(`http://127.0.0.1:${port}/api/health`).then((reply) => reply.json());
  assert.equal(health.name, "relay");
  assert.equal(health.root, root);
  assert.equal(health.pid, mcp.child.pid);
  const runtime = readServiceRuntime({ root });
  assert.equal(runtime.pid, mcp.child.pid);
  assert.equal(runtime.port, port);

  const listed = await mcp.send("tools/list");
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), ["relay"]);

  const noOpen = await mcp.send("tools/call", { name: "relay", arguments: {} });
  assert.equal(noOpen.error.message, "No app has opened a Relay yet.");

  const opened = await post(port, "/api/relay/open", {
    appName: "mcp-chess",
    payload: { mode: "play" },
  });
  assert.equal(opened.response.ok, true);
  assert.equal(opened.data.created, true);

  const conflict = await post(port, "/api/relay/open", { appName: "other-app" });
  assert.equal(conflict.response.status, 409);
  assert.match(conflict.data.error, /Relay already open for app: mcp-chess/);

  const waitPromise = mcp.send("tools/call", { name: "relay", arguments: {} });
  const early = await Promise.race([waitPromise, timeout(300)]);
  assert.equal(early, Symbol.for("timeout"), "relay returned before the app sent a message");

  const duplicateWait = await mcp.send("tools/call", { name: "relay", arguments: {} });
  assert.match(duplicateWait.error.message, /active agent waiter/);

  const sent = await post(port, "/api/relay/send", false);
  assert.equal(sent.response.ok, true);

  const waitResult = await Promise.race([waitPromise, timeout(3000)]);
  assert.notEqual(waitResult, Symbol.for("timeout"), "relay did not return after app send");
  assert.deepEqual(waitResult.result.structuredContent, {
    status: "message",
    appName: "mcp-chess",
    payload: false,
  });

  const missingReply = await mcp.send("tools/call", { name: "relay", arguments: {} });
  assert.equal(missingReply.error.message, "Relay is waiting for a reply to the delivered app message.");

  const followupPromise = mcp.send("tools/call", {
    name: "relay",
    arguments: { bodyMarkdown: "Develop a piece before attacking." },
  });
  const appReply = await post(port, "/api/relay/receive", { after: 0 });
  assert.equal(appReply.response.ok, true);
  assert.equal(appReply.data.items.length, 1);
  assert.equal(appReply.data.items[0].inReplyTo, sent.data.event.seq);
  assert.deepEqual(appReply.data.items[0].payload, { bodyMarkdown: "Develop a piece before attacking." });

  const marked = await post(port, "/api/relay/received", { through: appReply.data.nextAfter });
  assert.equal(marked.response.ok, true);
  const openRelay = store.findOpenRelay();
  const empty = store.pollEvents({
    relayId: openRelay.relayId,
    client: "app",
    cursor: 0,
    types: ["relay.reply"],
  });
  assert.equal(empty.length, 0);

  const stillWaiting = await Promise.race([followupPromise, timeout(300)]);
  assert.equal(stillWaiting, Symbol.for("timeout"), "relay did not wait again after replying");

  const closed = await post(port, "/api/relay/close", {
    reason: "test-complete",
    payload: { ok: true },
  });
  assert.equal(closed.response.ok, true, closed.data.error);
  const closedResult = await Promise.race([followupPromise, timeout(3000)]);
  assert.deepEqual(closedResult.result.structuredContent, {
    status: "closed",
    appName: "mcp-chess",
    reason: "test-complete",
    payload: { ok: true },
  });

  const lateReply = await mcp.send("tools/call", {
    name: "relay",
    arguments: { ignored: true },
  });
  assert.equal(lateReply.error.message, "No app has opened a Relay yet.");

  await post(port, "/api/relay/open", {
    appName: "mcp-close-before-reply",
    payload: { mode: "close-before-reply" },
  });
  const closeBeforeReplyWait = mcp.send("tools/call", { name: "relay", arguments: {} });
  const closeBeforeReplySent = await post(port, "/api/relay/send", { question: "close soon" });
  const closeBeforeReplyMessage = await Promise.race([closeBeforeReplyWait, timeout(3000)]);
  assert.deepEqual(closeBeforeReplyMessage.result.structuredContent, {
    status: "message",
    appName: "mcp-close-before-reply",
    payload: { question: "close soon" },
  });
  await post(port, "/api/relay/close", {
    reason: "closed-before-reply",
    payload: { ok: true },
  });
  const closeBeforeReplyResult = await mcp.send("tools/call", {
    name: "relay",
    arguments: { bodyMarkdown: "late" },
  });
  assert.deepEqual(closeBeforeReplyResult.result.structuredContent, {
    status: "closed",
    appName: "mcp-close-before-reply",
    reason: "closed-before-reply",
    payload: { ok: true },
  });
  const closedRelay = store.listRelays({ appName: "mcp-close-before-reply" })[0];
  const lateReplies = store.pollEvents({
    relayId: closedRelay.relayId,
    client: "app",
    cursor: closeBeforeReplySent.data.event.seq,
    types: ["relay.reply"],
  });
  assert.equal(lateReplies.length, 0);

  const secondMcp = createMcp(env);
  try {
    const secondInitialized = await secondMcp.send("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "relay-smoke-second", version: "0.0.0" },
    });
    assert.equal(secondInitialized.result.serverInfo.name, "relay");
    const secondListed = await secondMcp.send("tools/list");
    assert.deepEqual(secondListed.result.tools.map((tool) => tool.name), ["relay"]);
  } finally {
    await secondMcp.close();
  }

  await mcp.close();
  mcpClosed = true;
  await waitForHealthDown(port);
} finally {
  store.close();
  if (!mcpClosed) await mcp.close();
  await rm(root, { recursive: true, force: true });
}

if (mcp.stderr && !mcp.stderr.includes("ExperimentalWarning: SQLite")) {
  throw new Error(mcp.stderr);
}

const conflictRoot = await mkdtemp(path.join(os.tmpdir(), "relay-mcp-conflict-"));
const otherConflictRoot = await mkdtemp(path.join(os.tmpdir(), "relay-mcp-other-conflict-"));
const conflictPort = await freePort();
const externalService = await startRelayServer({ root: conflictRoot, port: conflictPort });
try {
  const attachedMcp = createMcp({
    ...process.env,
    RELAY_DATA_DIR: conflictRoot,
    RELAY_PORT: String(conflictPort),
  });
  try {
    const attachedInitialized = await attachedMcp.send("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "relay-smoke-attached", version: "0.0.0" },
    });
    assert.equal(attachedInitialized.result.serverInfo.name, "relay");
    const attachedListed = await attachedMcp.send("tools/list");
    assert.deepEqual(attachedListed.result.tools.map((tool) => tool.name), ["relay"]);
  } finally {
    await attachedMcp.close();
  }

  const conflict = await startMcpExpectFailure({
    ...process.env,
    RELAY_DATA_DIR: otherConflictRoot,
    RELAY_PORT: String(conflictPort),
  });
  assert.match(conflict.stderr, /Relay startup failed: Relay HTTP port .*already in use.*Existing Relay:.*pid.*root/);
  assert.match(conflict.stderr, /configured for root/);
} finally {
  await externalService.close();
  await rm(otherConflictRoot, { recursive: true, force: true });
  await rm(conflictRoot, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, relay: "one-tool-loop", cleaned: true }));
