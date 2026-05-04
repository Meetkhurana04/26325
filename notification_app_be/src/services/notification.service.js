"use strict";

const http = require("http");
const config = require("../config/config");
const { getTopN } = require("../utils/priority");
const { log } = require("../../../logging_middleware");

let cachedNotifications = [];
let readIds = new Set();
let lastFetchedAt = null;

const CACHE_TTL_MS = 30 * 1000;

function fetchFromServer() {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${config.testServerBase}/notifications`);

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port ? parseInt(parsed.port) : 80,
        path: parsed.pathname,
        method: "GET",
        headers: { Authorization: `Bearer ${config.authToken}` },
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => {
          raw += c;
        });
        res.on("end", () => {
          if (res.statusCode !== 200) {
            reject(new Error(`test server returned ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (_) {
            reject(new Error("bad response"));
          }
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function refreshIfNeeded() {
  const stale = !lastFetchedAt || Date.now() - lastFetchedAt > CACHE_TTL_MS;
  if (!stale) return;

  await log(
    "backend",
    "debug",
    "service",
    "cache stale, re-fetching notifications",
  );
  const data = await fetchFromServer();
  cachedNotifications = data.notifications || [];
  lastFetchedAt = Date.now();
  await log(
    "backend",
    "info",
    "service",
    `cached ${cachedNotifications.length} notifications`,
  );
}

function withReadStatus(list) {
  return list.map((n) => ({ ...n, isRead: readIds.has(n.ID) }));
}

async function listNotifications(type, page, limit) {
  await log(
    "backend",
    "info",
    "handler",
    `list — type=${type} page=${page} limit=${limit}`,
  );
  await refreshIfNeeded();

  let results = cachedNotifications.slice();
  if (type)
    results = results.filter(
      (n) => n.Type.toLowerCase() === type.toLowerCase(),
    );

  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(limit) || 20));
  const start = (pageNum - 1) * pageSize;

  return {
    total: results.length,
    page: pageNum,
    limit: pageSize,
    notifications: withReadStatus(results.slice(start, start + pageSize)),
  };
}

async function getNotificationById(id) {
  await log("backend", "info", "handler", `get by id: ${id}`);
  await refreshIfNeeded();
  const found = cachedNotifications.find((n) => n.ID === id);
  if (!found) return null;
  return { ...found, isRead: readIds.has(found.ID) };
}

async function markAsRead(id) {
  await log("backend", "info", "handler", `mark read: ${id}`);
  await refreshIfNeeded();
  const exists = cachedNotifications.some((n) => n.ID === id);
  if (!exists) {
    await log("backend", "warn", "handler", `not found: ${id}`);
    return false;
  }
  readIds.add(id);
  return true;
}

async function markAllAsRead() {
  await log("backend", "info", "handler", "mark all read");
  await refreshIfNeeded();
  cachedNotifications.forEach((n) => readIds.add(n.ID));
  return cachedNotifications.length;
}

async function getUnreadCount() {
  await refreshIfNeeded();
  const count = cachedNotifications.filter((n) => !readIds.has(n.ID)).length;
  await log("backend", "debug", "service", `unread: ${count}`);
  return count;
}

async function getPriorityNotifications(n) {
  await log("backend", "info", "handler", `top ${n} priority notifications`);
  await refreshIfNeeded();
  return withReadStatus(getTopN(cachedNotifications, n));
}

module.exports = {
  listNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getPriorityNotifications,
};
