"use strict";

const http = require("http");

const LOG_URL = "http://20.207.122.201/evaluation-service/logs";

const validStacks = ["backend", "frontend"];
const validLevels = ["debug", "info", "warn", "error", "fatal"];

const backendPkgs = [
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
];
const frontendPkgs = ["api", "component", "hook", "page", "state", "style"];
const sharedPkgs = ["auth", "config", "middleware", "utils"];

function pkgAllowed(stack, pkg) {
  if (sharedPkgs.includes(pkg)) return true;
  if (stack === "backend") return backendPkgs.includes(pkg);
  if (stack === "frontend") return frontendPkgs.includes(pkg);
  return false;
}

function sendLog(token, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(LOG_URL);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port) : 80,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch (_) {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      },
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function log(stack, level, pkg, message) {
  if (
    !validStacks.includes(stack) ||
    !validLevels.includes(level) ||
    !pkgAllowed(stack, pkg)
  ) {
    process.stderr.write(
      `[logger] invalid params — stack:${stack} level:${level} pkg:${pkg}\n`,
    );
    return null;
  }

  const token = process.env.AUTH_TOKEN;
  if (!token) {
    process.stderr.write("[logger] AUTH_TOKEN not set\n");
    return null;
  }

  try {
    return await sendLog(token, { stack, level, package: pkg, message });
  } catch (err) {
    process.stderr.write(`[logger] ${err.message}\n`);
    return null;
  }
}

module.exports = { log };
