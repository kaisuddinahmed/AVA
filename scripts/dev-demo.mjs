import { spawn } from "node:child_process";
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
    cmd: npmCmd,
    args: ["run", "dev", "--workspace=@ava/dashboard"],
  },
  {
    name: "wizard",
    cmd: npmCmd,
    args: ["run", "dev", "--workspace=@ava/wizard"],
  },
  {
    name: "integration",
    cmd: npmCmd,
    args: ["run", "dev", "--workspace=@ava/demo"],
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
  const statuses = await Promise.all(startupPorts.map((entry) => isPortOpen(entry.port)));
  const occupied = startupPorts.filter((_, index) => statuses[index]);

  if (occupied.length === 0) return;

  const detail = occupied.map((entry) => `${entry.port} (${entry.service})`).join(", ");
  console.error(`[dev:demo] Port(s) already in use: ${detail}`);
  console.error(
    '[dev:demo] Stop old processes first. Example: pkill -f "apps/server/src/index.ts|scripts/serve-store.mjs|apps/demo/vite.config.js"'
  );
  process.exit(1);
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
