#!/usr/bin/env node
import { appendEvent, chessDataRoot, dataPaths, ensureDataLayout, readJson, writeJson } from "../src/data.mjs";

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      args[token.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    }
  }
  return args;
}

const args = readArgs(process.argv.slice(2));
const elo = Number(args.elo || args.level);
if (!Number.isFinite(elo)) {
  console.error("Usage: npm run profile -- --elo <starting-maia-level> [--rating \"source level\"] --notes \"short intake\"");
  process.exit(1);
}

const root = chessDataRoot();
await ensureDataLayout(root);
const paths = dataPaths(root);
const existing = await readJson(paths.profile, {});
const providedLevel = args.rating || args["provided-level"] || existing.providedLevel || existing.knownRating || null;
const profile = {
  ...existing,
  createdAt: existing.createdAt || new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  assignedMaiaElo: elo,
  currentMaiaElo: elo,
  maiaModel: args.model || existing.maiaModel || "maia3-79m",
  maiaDevice: args.device || existing.maiaDevice || "cpu",
  providedLevel,
  knownRating: providedLevel,
  notes: args.notes || existing.notes || "",
};

await writeJson(paths.profile, profile);
await appendEvent(root, "profile_updated", { currentMaiaElo: elo, profilePath: paths.profile });
console.log(paths.profile);
