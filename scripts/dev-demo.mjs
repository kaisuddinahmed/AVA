import { spawn, spawnSync } from "node:child_process";
import net from "node:net";

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";
const probeHosts = ["127.0.0.1", "::1", "localhost"];

const targets = [
  {
    name: "server",
    cmd: npmCmd,
    args: ["run", "dev", "--workspace=@ava/server"],
  },
  {
    name: "store",
    cmd: "node",
    args: ["scripts/serve-store.mjs"],
  },
  {
    name: "dashboard",
    cmd: "node",
    args: ["scripts/serve-static.mjs", "apps/dashboard/dist", "3000"],
  },
  {
    name: "wizard",
    cmd: "node",
    args: ["scripts/serve-static.mjs", "apps/wizard/dist", "3002"],
  },
  {
    name: "integration",
    cmd: "node",
    args: ["scripts/serve-static.mjs", "apps/demo/dist", "4002"],
  },
];

const children = [];
let shuttingDown = false;
let readyAnnounced = false;
const requiredPorts = [8080, 3001, 3000, 3002, 4002];
const startupPorts = [
  { port: 8080, service: "server" },
  { port: 3001, service: "store" },
  { port: 3000, service: "dashboard" },
  { port: 3002, service: "wizard" },
  { port: 4002, service: "integration" },
];
const autoCleanEnabled = process.env.AVA_DEMO_AUTOCLEAN !== "0";

await preflight();

for (const target of targets) {
  console.log(`[dev:demo] starting ${target.name}: ${target.cmd} ${target.args.join(" ")}`);
  const child = spawn(target.cmd, target.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  child.on("spawn", () => {
    console.log(`[dev:demo] ${target.name} started (pid: ${child.pid ?? "n/a"})`);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.error(`[dev:demo] ${target.name} exited (${reason}). Stopping all...`);
    shutdown(code ?? 1);
  });

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[dev:demo] Failed to start ${target.name}:`, error);
    shutdown(1);
  });

  children.push(child);
}

const readinessInterval = setInterval(async () => {
  if (shuttingDown || readyAnnounced) return;

  const statuses = await Promise.all(requiredPorts.map(isPortOpen));
  const allUp = statuses.every(Boolean);
  const summary = requiredPorts
    .map((port, index) => `${port}:${statuses[index] ? "up" : "down"}`)
    .join(" ");

  if (allUp) {
    readyAnnounced = true;
    console.log("[dev:demo] Ready -> http://localhost:4002 (demo), http://localhost:3002 (wizard standalone), http://localhost:3001 (store), http://localhost:3000 (dashboard), http://localhost:8080/health (server)");
    clearInterval(readinessInterval);
    return;
  }

  console.log(`[dev:demo] Waiting for services... ${summary}`);
}, 5000);

setTimeout(() => {
  if (!readyAnnounced && !shuttingDown) {
    console.warn("[dev:demo] Startup is taking longer than expected. If this persists, run services one-by-one for diagnostics.");
  }
}, 60000).unref();

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(readinessInterval);

  for (const child of children) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore.
    }
  }

  setTimeout(() => {
    for (const child of children) {
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore.
      }
    }
    process.exit(code);
  }, 1500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function preflight() {
  let occupied = await getOccupiedPorts();

  if (occupied.length === 0) return;

  if (autoCleanEnabled && !isWin) {
    await autoCleanOccupiedPorts(occupied);
    occupied = await getOccupiedPorts();
    if (occupied.length === 0) {
      console.log("[dev:demo] Cleared stale listeners. Continuing startup.");
      return;
    }
  }

  const detail = occupied.map((entry) => `${entry.port} (${entry.service})`).join(", ");
  console.error(`[dev:demo] Port(s) already in use: ${detail}`);
  for (const entry of occupied) {
    const listeners = getPortListeners(entry.port);
    if (!listeners.length) continue;
    for (const listener of listeners) {
      console.error(
        `[dev:demo] ${entry.port} listener pid=${listener.pid} cmd=${listener.command || "unknown"}`
      );
    }
  }
  if (autoCleanEnabled && isWin) {
    console.error("[dev:demo] Auto-clean is disabled on Windows. Stop the listed PIDs manually.");
  }
  console.error(
    '[dev:demo] Stop old processes first. Example: pkill -f "apps/server/src/index.ts|scripts/serve-store.mjs|apps/demo/vite.config.js"'
  );
  process.exit(1);
}

async function getOccupiedPorts() {
  const statuses = await Promise.all(startupPorts.map((entry) => isPortOpen(entry.port)));
  return startupPorts.filter((_, index) => statuses[index]);
}

async function autoCleanOccupiedPorts(occupied) {
  const pids = new Set();
  for (const entry of occupied) {
    for (const listener of getPortListeners(entry.port)) {
      if (listener?.pid) pids.add(listener.pid);
    }
  }
  if (pids.size === 0) return;

  const pidList = [...pids].join(", ");
  console.warn(`[dev:demo] Auto-clean: stopping stale listener PIDs ${pidList}`);

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Ignore: already exited or inaccessible.
    }
  }
  await delay(700);

  for (const pid of pids) {
    try {
      process.kill(pid, 0);
      process.kill(pid, "SIGKILL");
    } catch {
      // Ignore: no longer running.
    }
  }
  await delay(300);
}

function getPortListeners(port) {
  if (isWin) return [];
  const out = spawnSync(
    "lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"],
    { encoding: "utf8" },
  );
  if (out.status !== 0 || !out.stdout) return [];

  const lines = out.stdout.split("\n").filter(Boolean);
  const listeners = [];
  let current = null;

  for (const line of lines) {
    const type = line[0];
    const value = line.slice(1);
    if (type === "p") {
      if (current?.pid) listeners.push(current);
      current = { pid: Number(value), command: "" };
      continue;
    }
    if (type === "c") {
      if (!current) current = { pid: 0, command: "" };
      current.command = value;
    }
  }
  if (current?.pid) listeners.push(current);

  return listeners.filter((item) => Number.isFinite(item.pid) && item.pid > 0);
}

async function isPortOpen(port) {
  for (const host of probeHosts) {
    if (await isPortOpenOnHost(port, host)) {
      return true;
    }
  }
  return false;
}

function isPortOpenOnHost(port, host) {
  return new Promise((resolvePort) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolvePort(result);
    };

    socket.setTimeout(700);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}
