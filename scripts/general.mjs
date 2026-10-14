import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const home = homedir();
const stateFile = join(home, ".agents", "skarian-general.json");
const lockFile = process.env.XDG_STATE_HOME
  ? join(process.env.XDG_STATE_HOME, "skills", ".skill-lock.json")
  : join(home, ".agents", ".skill-lock.json");

function read(file, fallback) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`Cannot read ${file}: ${error.message}`);
  }
}

function installed() {
  const lock = read(lockFile, { version: 3, skills: {} });
  if (lock.version !== 3 || !lock.skills || typeof lock.skills !== "object" || Array.isArray(lock.skills)) {
    throw new Error(`Unsupported skill lock: ${lockFile}`);
  }
  return lock.skills;
}

export function generalState() {
  const state = read(stateFile, { version: 1, skills: {} });
  if (state.version !== 1 || !state.skills || typeof state.skills !== "object" || Array.isArray(state.skills)
    || Object.entries(state.skills).some(([name, source]) =>
      !/^[a-z0-9][a-z0-9-]*$/.test(name) || typeof source !== "string"
      || !/^[\w.-]+\/[\w.-]+$/.test(source))) {
    throw new Error(`Invalid general preset record: ${stateFile}`);
  }
  return state;
}

function save(state) {
  mkdirSync(dirname(stateFile), { recursive: true });
  const temporary = `${stateFile}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, stateFile);
}

export function rememberGeneral(state, source, names) {
  const expected = source.startsWith("https://github.com/")
    ? new URL(source).pathname.split("/").slice(1, 3).join("/") : source;
  const lock = installed();
  for (const name of names) {
    if (lock[name]?.source !== expected || lock[name]?.sourceType !== "github") {
      throw new Error(`Cannot confirm installed source for ${name}; general preset record unchanged.`);
    }
  }
  for (const name of names) state.skills[name] = expected;
  save(state);
}

export function cleanGeneral(state, selected, run) {
  for (const [name, source] of Object.entries(state.skills)) {
    if (selected.has(name)) continue;
    const entry = installed()[name];
    if (entry?.source === source && entry.sourceType === "github") {
      console.log(`Removing former general skill: ${name} (${source})`);
      const result = run(["remove", name, "--global", "--yes"], "inherit");
      if (result.error || result.status !== 0 || installed()[name]
        || existsSync(join(home, ".agents", "skills", name))) {
        throw new Error(`Removal incomplete for ${name}; kept its general preset record for retry.`);
      }
    } else {
      console.log(`Leaving ${name} alone: its original installation is no longer recorded.`);
    }
    delete state.skills[name];
    save(state);
  }
}
