#!/usr/bin/env node
import { appendProgress, chessDataRoot, dataPaths, ensureDataLayout, readJson, writeJson } from "../src/data.mjs";

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
if (!args["game-id"] || !args.summary) {
  console.error("Usage: npm run progress -- --game-id <game-id> --summary \"short review\" [--next-elo <level>]");
  process.exit(1);
}

const root = chessDataRoot();
await ensureDataLayout(root);
const paths = dataPaths(root);
const progress = {
  gameId: args["game-id"],
  summary: args.summary,
  nextMaiaElo: args["next-elo"] ? Number(args["next-elo"]) : undefined,
};
await appendProgress(root, "agent_review", progress);

if (progress.nextMaiaElo) {
  const profile = await readJson(paths.profile, {});
  await writeJson(paths.profile, {
    ...profile,
    updatedAt: new Date().toISOString(),
    currentMaiaElo: progress.nextMaiaElo,
  });
}

console.log(paths.progress);
