#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const resultsDir = path.join(import.meta.dirname, "results");

const env = {
  ...process.env,
  HF_HOME: process.env.HF_HOME || "/private/tmp/maia3-hf-cache",
};

const maiaBin = process.env.MAIA3_BIN || "/private/tmp/maia3-prototype-venv/bin/maia3-uci";
const model = process.env.MAIA3_MODEL || "maia3-5m";
const elo = process.env.MAIA3_ELO || "1800";
const device = process.env.MAIA3_DEVICE || "cpu";
const timeoutMs = Number(process.env.MAIA3_TIMEOUT_MS || 120000);
const sampleMs = Number(process.env.MAIA3_SAMPLE_MS || 250);
const holdAfterReadyMs = Number(process.env.MAIA3_HOLD_AFTER_READY_MS || 0);
const holdAfterTestsMs = Number(process.env.MAIA3_HOLD_AFTER_TESTS_MS || 0);
const repeatCount = Number(process.env.MAIA3_REPEAT || 1);

const args = [
  "--model",
  model,
  "--device",
  device,
  "--no-use-amp",
  "--local-files-only",
  "--use-uci-history",
  "--elo",
  elo,
  "--multipv",
  "3",
];

const tests = [
  {
    name: "startpos",
    command: "position startpos",
  },
  {
    name: "open-game-e4",
    command: "position startpos moves e2e4 e7e5 g1f3 b8c6 f1b5",
  },
  {
    name: "queen-pawn",
    command: "position startpos moves d2d4 g8f6 c2c4 e7e6 g1f3 d7d5",
  },
];

const now = () => Number(process.hrtime.bigint()) / 1_000_000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function psSample(pid) {
  return new Promise((resolve) => {
    try {
      execFile("/bin/ps", ["-p", String(pid), "-o", "%cpu=,rss=,etime="], (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(null);
          return;
        }

        const line = stdout.trim().replace(/\s+/g, " ");
        const [cpuRaw, rssRaw, ...etimeParts] = line.split(" ");
        resolve({
          tMs: now(),
          cpuPct: Number(cpuRaw),
          rssMb: Number(rssRaw) / 1024,
          etime: etimeParts.join(" "),
        });
      });
    } catch {
      resolve(null);
    }
  });
}

async function hold(label, ms) {
  if (ms <= 0) {
    return;
  }
  console.log(JSON.stringify({ event: "hold", label, ms }));
  await wait(ms);
}

function summarizeSamples(samples) {
  const valid = samples.filter(Boolean);
  if (!valid.length) {
    return null;
  }

  const rssValues = valid.map((sample) => sample.rssMb);
  const cpuValues = valid.map((sample) => sample.cpuPct);
  return {
    count: valid.length,
    maxRssMb: Math.max(...rssValues),
    avgRssMb: rssValues.reduce((sum, value) => sum + value, 0) / rssValues.length,
    maxCpuPct: Math.max(...cpuValues),
    avgCpuPct: cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length,
    first: valid[0],
    last: valid.at(-1),
  };
}

function summarizeTimings(results) {
  const values = results.map((result) => result.elapsedMs).sort((a, b) => a - b);
  if (!values.length) {
    return null;
  }

  const percentile = (p) => values[Math.floor((values.length - 1) * p)];
  return {
    count: values.length,
    minMs: values[0],
    avgMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: values.at(-1),
  };
}

async function main() {
  await mkdir(resultsDir, { recursive: true });

  const startedAt = new Date();
  const proc = spawn(maiaBin, args, {
    cwd: root,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  console.log(JSON.stringify({
    event: "spawned",
    pid: proc.pid,
    bin: maiaBin,
    model,
    elo,
    device,
    repeatCount,
  }));

  let stdoutBuffer = "";
  let stderrBuffer = "";
  let closed = false;
  const samples = [];

  const sampler = setInterval(async () => {
    if (!closed) {
      samples.push(await psSample(proc.pid));
    }
  }, sampleMs);

  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
  });
  proc.stderr.on("data", (chunk) => {
    stderrBuffer += chunk;
  });

  const closePromise = new Promise((resolve) => {
    proc.on("close", (code, signal) => {
      closed = true;
      clearInterval(sampler);
      resolve({ code, signal });
    });
  });

  const send = (line) => {
    proc.stdin.write(`${line}\n`);
  };

  const waitFor = async (needle, startIndex = 0) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const foundAt = stdoutBuffer.indexOf(needle, startIndex);
      if (foundAt !== -1) {
        return foundAt + needle.length;
      }
      if (closed) {
        throw new Error(`process closed before ${needle}`);
      }
      await wait(25);
    }
    throw new Error(`timed out waiting for ${needle}`);
  };

  const waitForLine = async (prefix, startIndex = 0) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const text = stdoutBuffer.slice(startIndex);
      const lines = text.split(/\r?\n/);
      const completeLineCount = text.endsWith("\n") ? lines.length : lines.length - 1;
      for (const line of lines.slice(0, completeLineCount)) {
        if (line.startsWith(prefix)) {
          return startIndex + text.indexOf(line) + line.length + 1;
        }
      }
      if (closed) {
        throw new Error(`process closed before line ${prefix}`);
      }
      await wait(25);
    }
    throw new Error(`timed out waiting for line ${prefix}`);
  };

  const checkpoints = {};
  const commandLog = [];
  const testResults = [];

  const startMs = now();
  send("uci");
  checkpoints.uciokIndex = await waitFor("uciok");
  checkpoints.handshakeMs = now() - startMs;
  commandLog.push({ command: "uci", elapsedMs: checkpoints.handshakeMs });

  const readyStartMs = now();
  send("isready");
  checkpoints.readyokIndex = await waitFor("readyok", checkpoints.uciokIndex);
  checkpoints.readyMs = now() - readyStartMs;
  commandLog.push({ command: "isready", elapsedMs: checkpoints.readyMs });

  await hold("after-ready", holdAfterReadyMs);

  for (let repeat = 0; repeat < repeatCount; repeat += 1) {
    for (const test of tests) {
      const before = stdoutBuffer.length;
      send(test.command);
      const goStartMs = now();
      send("go nodes 1");
      const afterBestmove = await waitForLine("bestmove ", before);
      const elapsedMs = now() - goStartMs;
      const output = stdoutBuffer.slice(before, afterBestmove).trim().split(/\r?\n/).filter(Boolean);
      const bestmoveLine = output.find((line) => line.startsWith("bestmove ")) || null;
      const infoLines = output.filter((line) => line.startsWith("info "));
      testResults.push({
        name: repeatCount === 1 ? test.name : `${test.name}#${repeat + 1}`,
        positionCommand: test.command,
        elapsedMs,
        bestmoveLine,
        infoLines,
      });
    }
  }

  await hold("after-tests", holdAfterTestsMs);

  send("quit");
  const closeResult = await closePromise;
  const finishedAt = new Date();

  const report = {
    generatedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    command: {
      bin: maiaBin,
      args,
      repeatCount,
      env: {
        HF_HOME: env.HF_HOME,
      },
    },
    system: {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      cpuModel: os.cpus()[0]?.model,
      totalMemoryMb: os.totalmem() / 1024 / 1024,
      freeMemoryMbAtEnd: os.freemem() / 1024 / 1024,
    },
    process: {
      pid: proc.pid,
      close: closeResult,
      stderr: stderrBuffer.trim().split(/\r?\n/).filter(Boolean).slice(-20),
    },
    timings: {
      handshakeMs: checkpoints.handshakeMs,
      readyMs: checkpoints.readyMs,
      summary: summarizeTimings(testResults),
      tests: testResults.map(({ name, elapsedMs }) => ({ name, elapsedMs })),
    },
    profile: summarizeSamples(samples),
    tests: testResults,
    stdoutTail: stdoutBuffer.trim().split(/\r?\n/).filter(Boolean).slice(-40),
  };

  const stamp = finishedAt.toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(resultsDir, `${stamp}-maia3-${model}-${device}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(JSON.stringify({
    ok: closeResult.code === 0,
    reportPath,
    model,
    elo,
    device,
    repeatCount,
    timings: {
      handshakeMs: report.timings.handshakeMs,
      readyMs: report.timings.readyMs,
      summary: report.timings.summary,
    },
    profile: report.profile,
    bestmoves: testResults.slice(0, 10).map((test) => ({
      name: test.name,
      bestmoveLine: test.bestmoveLine,
    })),
    bestmoveCount: testResults.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
