#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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

for (const [source, skills] of sources[category]) {
  console.log(`Installing ${skills.join(", ")} from ${source}`);
  const args = ["--yes", "skills@latest", "add", source, "--skill", ...skills, "--yes"];
  if (category !== "project") args.push("--global");
  const result = spawnSync("npx", args, {
    stdio: "inherit",
    env,
    // Windows exposes npx as a .cmd file. All child arguments come from this catalog.
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0) {
    console.error(`Installation failed for ${source}${result.error ? `: ${result.error.message}` : ""}`);
    process.exit(result.status || 1);
  }
}
