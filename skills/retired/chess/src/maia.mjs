import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Chess } from "chess.js";
import { chessDataRoot, maiaRuntimePaths } from "./data.mjs";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWindows() {
  return process.platform === "win32";
}

export function uciToMove(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4] || undefined,
  };
}

export function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

export function pickStubMove(uciMoves) {
  const game = new Chess();
  for (const uci of uciMoves) {
    game.move(uciToMove(uci));
  }
  const legal = game.moves({ verbose: true });
  const move = legal.find((candidate) => candidate.san.includes("+"))
    || legal.find((candidate) => candidate.flags.includes("c"))
    || legal[0];
  return move ? moveToUci(move) : null;
}

export class MaiaEngine {
  constructor({
    dataRoot = chessDataRoot(),
    elo = 600,
    model = process.env.CHESS_MAIA_MODEL || "maia3-79m",
    fallbackModel = "maia3-5m",
    device = process.env.CHESS_MAIA_DEVICE || "cpu",
  } = {}) {
    const runtime = maiaRuntimePaths(dataRoot);
    this.dataRoot = dataRoot;
    this.bin = process.env.CHESS_MAIA_BIN || runtime.maiaBin;
    this.hfCacheDir = process.env.HF_HOME || runtime.hfCacheDir;
    this.elo = String(process.env.CHESS_MAIA_ELO || elo);
    this.model = model;
    this.fallbackModel = fallbackModel;
    this.device = device;
    this.proc = null;
    this.stdout = "";
    this.stderr = "";
    this.closed = false;
    this.ready = null;
    this.queue = Promise.resolve();
  }

  async assertInstalled() {
    await access(this.bin);
  }

  async start() {
    if (this.ready) {
      return this.ready;
    }
    this.ready = this.#startWithFallback();
    return this.ready;
  }

  bestMove(uciMoves) {
    this.queue = this.queue.then(() => this.#bestMove(uciMoves));
    return this.queue;
  }

  async close() {
    if (!this.proc || this.closed) {
      return;
    }
    this.proc.stdin.write("quit\n");
    await wait(50);
    if (!this.closed) {
      this.proc.kill();
    }
  }

  async #startWithFallback() {
    try {
      await this.#start(this.model);
    } catch (error) {
      if (this.model === this.fallbackModel) {
        throw error;
      }
      this.stderr = "";
      this.stdout = "";
      this.closed = false;
      this.model = this.fallbackModel;
      await this.#start(this.model);
    }
  }

  async #start(model) {
    await this.assertInstalled();
    const args = [
      "--model", model,
      "--device", this.device,
      "--no-use-amp",
      "--local-files-only",
      "--use-uci-history",
      "--elo", this.elo,
      "--multipv", "1",
    ];
    this.proc = spawn(this.bin, args, {
      env: {
        ...process.env,
        HF_HOME: this.hfCacheDir,
        PATH: process.env.PATH,
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: isWindows(),
    });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stderr.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => {
      this.stdout += chunk;
    });
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk;
    });
    this.proc.on("close", () => {
      this.closed = true;
    });
    this.#send("uci");
    const uciIndex = await this.#waitFor("uciok");
    this.#send("isready");
    await this.#waitFor("readyok", uciIndex);
  }

  async #bestMove(uciMoves) {
    await this.start();
    const before = this.stdout.length;
    if (uciMoves.length) {
      this.#send(`position startpos moves ${uciMoves.join(" ")}`);
    } else {
      this.#send("position startpos");
    }
    this.#send("go nodes 1");
    const after = await this.#waitForLine("bestmove ", before);
    const text = this.stdout.slice(before, after);
    const line = text.split(/\r?\n/).find((entry) => entry.startsWith("bestmove "));
    return line?.split(/\s+/)[1] || null;
  }

  #send(command) {
    this.proc.stdin.write(`${command}\n`);
  }

  async #waitFor(needle, startIndex = 0) {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const foundAt = this.stdout.indexOf(needle, startIndex);
      if (foundAt !== -1) {
        return foundAt + needle.length;
      }
      if (this.closed) {
        throw new Error(`Maia closed before ${needle}: ${this.stderr.trim()}`);
      }
      await wait(25);
    }
    throw new Error(`Timed out waiting for Maia ${needle}: ${this.stderr.trim()}`);
  }

  async #waitForLine(prefix, startIndex = 0) {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const text = this.stdout.slice(startIndex);
      const lines = text.split(/\r?\n/);
      const completeLineCount = text.endsWith("\n") ? lines.length : lines.length - 1;
      for (const line of lines.slice(0, completeLineCount)) {
        if (line.startsWith(prefix)) {
          return startIndex + text.indexOf(line) + line.length + 1;
        }
      }
      if (this.closed) {
        throw new Error(`Maia closed before ${prefix}: ${this.stderr.trim()}`);
      }
      await wait(25);
    }
    throw new Error(`Timed out waiting for Maia line ${prefix}: ${this.stderr.trim()}`);
  }
}
