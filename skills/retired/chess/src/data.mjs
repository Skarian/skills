import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function chessDataRoot() {
  return path.resolve(process.env.CHESS_DATA_DIR || path.join(os.homedir(), ".skills", "chess"));
}

export function maiaRuntimePaths(root = chessDataRoot()) {
  const runtimeRoot = path.join(root, "runtime", "maia3");
  return {
    runtimeRoot,
    sourceDir: path.join(runtimeRoot, "src"),
    venvDir: path.join(runtimeRoot, "venv"),
    hfCacheDir: path.join(runtimeRoot, "hf-cache"),
    maiaBin: process.platform === "win32"
      ? path.join(runtimeRoot, "venv", "Scripts", "maia3-uci.exe")
      : path.join(runtimeRoot, "venv", "bin", "maia3-uci"),
  };
}

export async function ensureDataLayout(root = chessDataRoot()) {
  await Promise.all([
    mkdir(root, { recursive: true }),
    mkdir(path.join(root, "games"), { recursive: true }),
    mkdir(path.join(root, "reviews"), { recursive: true }),
    mkdir(path.join(root, "sessions"), { recursive: true }),
    mkdir(path.join(root, "positions"), { recursive: true }),
    mkdir(path.join(root, "runtime", "maia3"), { recursive: true }),
  ]);
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(tmpPath, filePath);
}

export async function appendNdjson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`);
}

export function timestampId(prefix = "game") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

export function dataPaths(root = chessDataRoot()) {
  return {
    root,
    profile: path.join(root, "profile.json"),
    events: path.join(root, "events.ndjson"),
    progress: path.join(root, "progress.ndjson"),
    currentSession: path.join(root, "sessions", "current.json"),
    gamesDir: path.join(root, "games"),
    reviewsDir: path.join(root, "reviews"),
  };
}

export async function appendEvent(root, type, data = {}) {
  await appendNdjson(dataPaths(root).events, {
    type,
    at: new Date().toISOString(),
    ...data,
  });
}

export async function appendProgress(root, type, data = {}) {
  await appendNdjson(dataPaths(root).progress, {
    type,
    at: new Date().toISOString(),
    ...data,
  });
}
