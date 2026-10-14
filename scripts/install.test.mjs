import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const installer = fileURLToPath(new URL("./install.mjs", import.meta.url));

async function runInstaller(args = [], failOn = "", response = "installed") {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "skills-installer-")));
  try {
    const bin = path.join(root, "bin");
    const log = path.join(root, "calls.ndjson");
    await mkdir(bin);
    const stub = path.join(bin, "npx.mjs");
    await writeFile(stub, `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.INSTALL_TEST_LOG, JSON.stringify({ args, cwd: process.cwd(), npmPackage: process.env.npm_config_package, npmCall: process.env.npm_config_call }) + "\\n");
if (args.includes(process.env.INSTALL_TEST_FAIL_ON)) process.exit(7);
const selected = args.slice(args.indexOf("--skill") + 1);
const names = selected.slice(0, selected.findIndex((arg) => arg.startsWith("-")));
const reports = names.map((name) => ({ name, status: "installed" }));
if (process.env.INSTALL_TEST_RESPONSE === "failed") reports[0] = { name: names[0], status: "failed", error: "Fixture target refused installation" };
if (process.env.INSTALL_TEST_RESPONSE === "missing") reports.pop();
console.log(process.env.INSTALL_TEST_RESPONSE === "invalid" ? "invalid output" : JSON.stringify(reports));
`);
    const launcher = process.platform === "win32"
      ? `@"${process.execPath}" "${stub}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${stub}" "$@"\n`;
    await writeFile(path.join(bin, process.platform === "win32" ? "npx.cmd" : "npx"), launcher, { mode: 0o755 });
    const result = spawnSync(process.execPath, [installer, ...args], {
      cwd: root,
      env: {
        ...process.env,
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        INSTALL_TEST_LOG: log,
        INSTALL_TEST_FAIL_ON: failOn,
        INSTALL_TEST_RESPONSE: response,
        npm_config_package: "outer-installer-package",
        npm_config_call: "outer-installer-command",
      },
      encoding: "utf8",
    });
    const calls = (await readFile(log, "utf8").catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return "";
    })).trim().split("\n").filter(Boolean).map(JSON.parse);
    return { ...result, calls, root };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("default install uses the selected upstream sources and global scope", async () => {
  const result = await runInstaller();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.map(({ args }) => args), [
    ["--yes", "skills@latest", "add", "https://github.com/Skarian/skills/tree/main/skills/general", "--skill", "consensus", "discussion", "reference-module", "skill-research", "--yes"],
    ["--yes", "skills@latest", "add", "mattpocock/skills", "--skill", "grilling", "handoff", "--yes"],
    ["--yes", "skills@latest", "add", "blader/humanizer", "--skill", "humanizer", "--yes"],
    ["--yes", "skills@latest", "add", "danyuchn/asd-ste100-skill", "--skill", "asd-ste100", "--yes"],
  ].map((args) => [...args, "--agent", "codex", "gemini-cli", "zed", "claude-code", "grok", "--json", "--global"]));
});

test("personal install selects mac-screenshot globally", async () => {
  const result = await runInstaller(["personal"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.ok(result.calls[0].args.includes("mac-screenshot"));
  assert.ok(result.calls[0].args.includes("--global"));
});

test("nested npx does not inherit the outer package or command", async () => {
  const result = await runInstaller();
  assert.equal(result.status, 0, result.stderr);
  for (const call of result.calls) {
    assert.equal(call.npmPackage, undefined);
    assert.equal(call.npmCall, undefined);
  }
});

test("project install selects execplan in the caller's directory", async () => {
  const result = await runInstaller(["project"]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 1);
  assert.ok(result.calls[0].args.includes("execplan"));
  assert.ok(!result.calls[0].args.includes("--global"));
  assert.equal(result.calls[0].cwd, result.root);
});

test("invalid categories and extra arguments fail before installation", async () => {
  for (const args of [["retired"], ["__proto__"], ["general", "personal"]]) {
    const result = await runInstaller(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
    assert.equal(result.calls.length, 0);
  }
});

test("a failed source stops installation and preserves the exit code", async () => {
  const result = await runInstaller([], "mattpocock/skills");
  assert.equal(result.status, 7);
  assert.equal(result.calls.length, 2);
  assert.match(result.stderr, /Installation failed for mattpocock\/skills/);
});

test("partial failures stop installation even when the child exits successfully", async () => {
  const result = await runInstaller([], "", "failed");
  assert.equal(result.status, 1);
  assert.equal(result.calls.length, 1);
  assert.match(result.stderr, /Fixture target refused installation/);
});

test("missing or invalid install results cannot report success", async () => {
  for (const response of ["missing", "invalid"]) {
    const result = await runInstaller([], "", response);
    assert.equal(result.status, 1);
    assert.equal(result.calls.length, 1);
    assert.match(result.stderr, /did not report every requested skill/);
  }
});
