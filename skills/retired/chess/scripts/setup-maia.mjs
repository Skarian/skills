#!/usr/bin/env node
import { access, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { chessDataRoot, ensureDataLayout, maiaRuntimePaths } from "../src/data.mjs";

const MAIA_REPO = "https://github.com/CSSLab/maia3.git";
const MODELS = ["maia3-79m", "maia3-5m"];

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log([command, ...args].join(" "));
    const proc = spawn(command, args, {
      stdio: "inherit",
      env: options.env || process.env,
      cwd: options.cwd || process.cwd(),
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited ${code}`));
      }
    });
  });
}

async function findPython() {
  const candidates = [
    process.env.CHESS_PYTHON,
    "/opt/homebrew/bin/python3.12",
    "python3.12",
    "python3",
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await run(candidate, ["--version"], { env: process.env });
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new Error("Could not find Python. Install Python 3.12 or set CHESS_PYTHON.");
}

const root = chessDataRoot();
const runtime = maiaRuntimePaths(root);
await ensureDataLayout(root);
await mkdir(runtime.runtimeRoot, { recursive: true });

if (!(await exists(path.join(runtime.sourceDir, ".git")))) {
  await run("git", ["clone", "--depth", "1", MAIA_REPO, runtime.sourceDir]);
}

const python = await findPython();
if (!(await exists(runtime.maiaBin))) {
  await run(python, ["-m", "venv", runtime.venvDir]);
  const venvPython = process.platform === "win32"
    ? path.join(runtime.venvDir, "Scripts", "python.exe")
    : path.join(runtime.venvDir, "bin", "python");
  await run(venvPython, ["-m", "pip", "install", "--upgrade", "pip"]);
  await run(venvPython, ["-m", "pip", "install", runtime.sourceDir], {
    env: { ...process.env, PIP_CACHE_DIR: process.env.PIP_CACHE_DIR || path.join(root, "runtime", "pip-cache") },
  });
}

await run(runtime.maiaBin, ["--help"], { env: { ...process.env, HF_HOME: runtime.hfCacheDir } });
const maiaCacheBin = path.join(path.dirname(runtime.maiaBin), process.platform === "win32" ? "maia3-cache.exe" : "maia3-cache");
for (const model of MODELS) {
  await run(maiaCacheBin, ["--model", model], {
    env: { ...process.env, HF_HOME: runtime.hfCacheDir },
  });
}

console.log(`Maia ready: ${runtime.maiaBin}`);
console.log(`HF cache: ${runtime.hfCacheDir}`);
