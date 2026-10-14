#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { cleanGeneral, generalState, rememberGeneral } from "./general.mjs";

const agents = ["codex", "gemini-cli", "zed", "claude-code", "grok"];
const own = (category) => `https://github.com/Skarian/skills/tree/main/skills/${category}`;
const sources = {
  general: [
    [own("general"), ["consensus", "discussion", "reference-module", "skill-research"]],
    ["mattpocock/skills", ["grilling", "handoff"]],
    ["blader/humanizer", ["humanizer"]],
    ["danyuchn/asd-ste100-skill", ["asd-ste100"]],
  ],
  personal: [[own("personal"), ["mac-screenshot"]]],
  project: [[own("project"), ["execplan"]]],
};

const [category = "general", ...extra] = process.argv.slice(2);
if (!Object.hasOwn(sources, category) || extra.length) {
  console.error("Usage: npx --yes github:Skarian/skills [general|personal|project]");
  process.exit(1);
}

// Outer npx package/call settings must not change what the child npx executes.
const env = { ...process.env };
for (const name of Object.keys(env)) {
  if (/^npm_config_(package|call)$/i.test(name)) delete env[name];
}

// Invoke npm with Node directly, including when npm lives under a path with spaces.
const npm = env.npm_execpath || join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const useNpm = existsSync(npm);
const run = (args, output = "pipe") => spawnSync(useNpm ? process.execPath : "npx", useNpm
  ? [npm, "exec", "--yes", "--package=skills@latest", "--", "skills", ...args]
  : ["--yes", "skills@latest", ...args], {
  stdio: ["inherit", output, "inherit"],
  encoding: "utf8",
  env,
});

try {
  const state = category === "general" ? generalState() : null;
  for (const [source, skills] of sources[category]) {
    console.log(`Installing ${skills.join(", ")} from ${source}`);
    const args = ["add", source, "--skill", ...skills, "--yes", "--agent", ...agents, "--json"];
    if (category !== "project") args.push("--global");
    const result = run(args);
    let reports;
    try { reports = JSON.parse(result.stdout); } catch { /* Missing results fail below. */ }
    const complete = Array.isArray(reports) && skills.every((name) =>
      reports.some((report) => report?.name === name && report.status === "installed")
    ) && reports.every((report) => report?.status === "installed");
    if (result.error || result.status !== 0 || !complete) {
      console.error(`Installation failed for ${source}${result.error ? `: ${result.error.message}` : ""}`);
      for (const report of Array.isArray(reports) ? reports : []) {
        if (report?.status !== "installed") console.error(report?.error || "A skill did not install.");
      }
      if (!complete) console.error("The CLI did not report every requested skill as installed.");
      process.exit(result.status || 1);
    }
    if (state) rememberGeneral(state, source, skills);
    console.log(`Installed ${skills.join(", ")}`);
  }
  if (state) cleanGeneral(state, new Set(sources.general.flatMap(([, names]) => names)), run);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
