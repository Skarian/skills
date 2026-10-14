import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const installer = fileURLToPath(new URL("./install.mjs", import.meta.url));

async function runInstaller(args = [], failOn = "", response = "installed", fixture = {}) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), "skills-installer-")));
  try {
    const bin = path.join(root, "npm with spaces");
    const log = path.join(root, "calls.ndjson");
    await mkdir(bin);
    const agents = path.join(root, ".agents");
    const lockFile = path.join(root, "state", "skills", ".skill-lock.json");
    await mkdir(path.dirname(lockFile), { recursive: true });
    await mkdir(agents, { recursive: true });
    const entries = fixture.installed || {};
    await writeFile(lockFile, JSON.stringify({ version: 3, skills: entries }));
    if (fixture.managed) await writeFile(path.join(agents, "skarian-general.json"), JSON.stringify(fixture.managed));
    for (const name of fixture.existing || Object.keys(entries)) {
      const folder = path.join(agents, "skills", name);
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "SKILL.md"), `Fixture: ${name}`);
    }
    const stub = path.join(bin, "npx.mjs");
    await writeFile(stub, `import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const transportArgs = process.argv.slice(2);
const args = transportArgs[0] === "exec" ? ["--yes", "skills@latest", ...transportArgs.slice(5)] : transportArgs;
appendFileSync(process.env.INSTALL_TEST_LOG, JSON.stringify({ args, transportArgs, cwd: process.cwd(), npmPackage: process.env.npm_config_package, npmCall: process.env.npm_config_call }) + "\\n");
if (args.includes(process.env.INSTALL_TEST_FAIL_ON)) process.exit(7);
const lockFile = join(process.env.XDG_STATE_HOME, "skills", ".skill-lock.json");
const lock = JSON.parse(readFileSync(lockFile, "utf8"));
if (args[2] === "remove") {
  if (process.env.INSTALL_TEST_RESPONSE !== "remove-noop") {
    delete lock.skills[args[3]];
    rmSync(join(homedir(), ".agents", "skills", args[3]), { recursive: true, force: true });
    writeFileSync(lockFile, JSON.stringify(lock));
  }
  process.exit(0);
}
const selected = args.slice(args.indexOf("--skill") + 1);
const names = selected.slice(0, selected.findIndex((arg) => arg.startsWith("-")));
const reports = names.map((name) => ({ name, status: "installed" }));
if (process.env.INSTALL_TEST_RESPONSE === "failed") reports[0] = { name: names[0], status: "failed", error: "Fixture target refused installation" };
if (process.env.INSTALL_TEST_RESPONSE === "missing") reports.pop();
if (args.includes("--global")) {
  const source = args[3].startsWith("https://github.com/") ? new URL(args[3]).pathname.split("/").slice(1, 3).join("/") : args[3];
  for (const report of reports.filter((report) => report.status === "installed")) {
    lock.skills[report.name] = { source, sourceType: "github" };
    const folder = join(homedir(), ".agents", "skills", report.name);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "SKILL.md"), "Fixture");
  }
  writeFileSync(lockFile, JSON.stringify(lock));
}
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
        HOME: root,
        USERPROFILE: root,
        XDG_STATE_HOME: path.join(root, "state"),
        PATH: `${bin}${path.delimiter}${process.env.PATH}`,
        INSTALL_TEST_LOG: log,
        INSTALL_TEST_FAIL_ON: failOn,
        INSTALL_TEST_RESPONSE: response,
        npm_config_package: "outer-installer-package",
        npm_config_call: "outer-installer-command",
        npm_execpath: stub,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --throw-deprecation`.trim(),
      },
      encoding: "utf8",
    });
    const calls = (await readFile(log, "utf8").catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return "";
    })).trim().split("\n").filter(Boolean).map(JSON.parse);
    const managed = await readFile(path.join(agents, "skarian-general.json"), "utf8").then(JSON.parse).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    const installed = JSON.parse(await readFile(lockFile, "utf8")).skills;
    const preserved = [];
    for (const name of fixture.existing || Object.keys(entries)) {
      if (await readFile(path.join(agents, "skills", name, "SKILL.md"), "utf8").catch(() => null)) preserved.push(name);
    }
    return { ...result, calls, root, managed, installed, preserved };
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

test("npm runs directly without shell deprecations, including paths with spaces", async () => {
  const result = await runInstaller();
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /DEP0190|DeprecationWarning/);
  for (const call of result.calls) {
    assert.deepEqual(call.transportArgs.slice(0, 5), ["exec", "--yes", "--package=skills@latest", "--", "skills"]);
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

const oldSkill = {
  managed: { version: 1, skills: { "old-general": "Skarian/skills" } },
  installed: { "old-general": { source: "Skarian/skills", sourceType: "github" } },
};

test("successful general sync removes only previously managed skills after all installs", async () => {
  const result = await runInstaller([], "", "installed", {
    ...oldSkill,
    installed: {
      ...oldSkill.installed,
      cloudflare: { source: "cloudflare/skills", sourceType: "github" },
      runpod: { source: "runpod/runpod-plugins-official", sourceType: "github" },
      "untracked-own": { source: "Skarian/skills", sourceType: "github" },
      "mac-screenshot": { source: "Skarian/skills", sourceType: "github" },
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.calls.at(-1).args, ["--yes", "skills@latest", "remove", "old-general", "--global", "--yes"]);
  assert.equal(result.calls.length, 5);
  assert.deepEqual(result.preserved.sort(), ["cloudflare", "mac-screenshot", "runpod", "untracked-own"]);
  assert.equal(result.managed.skills["old-general"], undefined);
  assert.equal(Object.keys(result.managed.skills).length, 8);
  assert.equal(result.managed.skills.grilling, "mattpocock/skills");
});

test("first run adopts only the current selection", async () => {
  const result = await runInstaller([], "", "installed", { installed: oldSkill.installed });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, 4);
  assert.deepEqual(result.preserved, ["old-general"]);
  assert.equal(result.managed.skills["old-general"], undefined);
});

test("replaced or unrecorded installations are left alone", async () => {
  for (const entry of [{ source: "someone/else", sourceType: "github" }, { source: "Skarian/skills", sourceType: "local" }, null]) {
    const result = await runInstaller([], "", "installed", {
      ...oldSkill,
      installed: entry ? { "old-general": entry } : {},
      existing: ["old-general"],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, 4);
    assert.deepEqual(result.preserved, ["old-general"]);
    assert.equal(result.managed.skills["old-general"], undefined);
  }
});

test("failed installation does not clean up and preserves tracking for retry", async () => {
  for (const [failure, response] of [["mattpocock/skills", "installed"], ["", "failed"]]) {
    const result = await runInstaller([], failure, response, oldSkill);
    assert.notEqual(result.status, 0);
    assert.ok(result.calls.every(({ args }) => args[2] === "add"));
    assert.deepEqual(result.preserved, ["old-general"]);
    assert.equal(result.managed.skills["old-general"], "Skarian/skills");
    if (failure) assert.equal(result.managed.skills.consensus, "Skarian/skills");
  }
});

test("unsuccessful removal retains tracking even if the CLI exits zero", async () => {
  for (const [failure, response] of [["old-general", "installed"], ["", "remove-noop"]]) {
    const result = await runInstaller([], failure, response, oldSkill);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Removal incomplete/);
    assert.equal(result.managed.skills["old-general"], "Skarian/skills");
    assert.deepEqual(result.preserved, ["old-general"]);
  }
});

test("personal and project runs do not read or change general tracking", async () => {
  for (const category of ["personal", "project"]) {
    const result = await runInstaller([category], "", "installed", oldSkill);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls.length, 1);
    assert.deepEqual(result.managed, oldSkill.managed);
    assert.deepEqual(result.preserved, ["old-general"]);
  }
});

test("invalid tracking cannot turn into wildcard removal or shell arguments", async () => {
  for (const name of ["*", "--all", "../victim", "a&whoami", "$(whoami)"]) {
    const result = await runInstaller([], "", "installed", {
      managed: { version: 1, skills: { [name]: "Skarian/skills" } },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Invalid general preset record/);
    assert.equal(result.calls.length, 0);
  }
});
