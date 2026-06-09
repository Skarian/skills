import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const initStockfish = require("stockfish");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseInfo(line) {
  const parts = line.trim().split(/\s+/);
  const info = { raw: line };
  for (let i = 1; i < parts.length; i += 1) {
    const token = parts[i];
    if (token === "depth") info.depth = Number(parts[++i]);
    else if (token === "multipv") info.multipv = Number(parts[++i]);
    else if (token === "score") {
      const kind = parts[++i];
      const value = Number(parts[++i]);
      info.score = { kind, value };
    } else if (token === "pv") {
      info.pv = parts.slice(i + 1);
      break;
    }
  }
  return info;
}

function sideToMoveFromFen(fen) {
  return fen.split(/\s+/)[1] || "w";
}

export function scoreForWhite(analysis, fen) {
  const primary = analysis.lines.find((line) => line.multipv === 1) || analysis.lines[0];
  if (!primary?.score) {
    return null;
  }
  const raw = primary.score.kind === "mate"
    ? Math.sign(primary.score.value || 1) * 100000
    : primary.score.value;
  return sideToMoveFromFen(fen) === "w" ? raw : -raw;
}

export class StockfishEngine {
  constructor({ depth = 8, multipv = 2 } = {}) {
    this.depth = depth;
    this.multipv = multipv;
    this.engine = null;
    this.lines = [];
    this.ready = null;
    this.queue = Promise.resolve();
  }

  async init() {
    if (this.ready) {
      return this.ready;
    }
    this.ready = this.#init();
    return this.ready;
  }

  async #init() {
    const savedFetch = globalThis.fetch;
    this.engine = await initStockfish("lite-single");
    if (!globalThis.fetch && savedFetch) {
      globalThis.fetch = savedFetch;
    }
    this.engine.listener = (line) => {
      this.lines.push(String(line));
    };
    await this.#sendAndWait("uci", (line) => line === "uciok");
    this.#send(`setoption name MultiPV value ${this.multipv}`);
    await this.#sendAndWait("isready", (line) => line === "readyok");
  }

  analyzeFen(fen, options = {}) {
    this.queue = this.queue.then(() => this.#analyzeFen(fen, options));
    return this.queue;
  }

  async #analyzeFen(fen, options = {}) {
    await this.init();
    const depth = options.depth || this.depth;
    const multipv = options.multipv || this.multipv;
    this.#send(`setoption name MultiPV value ${multipv}`);
    this.#send(`position fen ${fen}`);
    const startIndex = this.lines.length;
    this.#send(`go depth ${depth}`);
    const bestmoveLine = await this.#waitFor((line) => line.startsWith("bestmove "), startIndex);
    const output = this.lines.slice(startIndex);
    const infoLines = output.filter((line) => line.startsWith("info "));
    const parsed = infoLines.map(parseInfo).filter((line) => line.depth === depth && line.score);
    const byMultiPv = new Map();
    for (const line of parsed) {
      byMultiPv.set(line.multipv || 1, line);
    }
    return {
      fen,
      depth,
      multipv,
      bestmove: bestmoveLine.split(/\s+/)[1] || null,
      lines: [...byMultiPv.values()].sort((a, b) => (a.multipv || 1) - (b.multipv || 1)),
      raw: output,
    };
  }

  async close() {
    if (this.engine) {
      this.#send("quit");
      await wait(25);
      this.engine = null;
    }
  }

  #send(command) {
    this.engine.sendCommand(command);
  }

  async #sendAndWait(command, predicate) {
    await this.initIfNeededWithoutHandshake();
    const startIndex = this.lines.length;
    this.#send(command);
    return this.#waitFor(predicate, startIndex);
  }

  async initIfNeededWithoutHandshake() {
    if (!this.engine) {
      return;
    }
  }

  async #waitFor(predicate, startIndex = 0) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      for (const line of this.lines.slice(startIndex)) {
        if (predicate(line)) {
          return line;
        }
      }
      await wait(20);
    }
    throw new Error("Timed out waiting for Stockfish");
  }
}
