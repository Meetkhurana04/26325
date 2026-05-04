"use strict";

const http = require("http");
const config = require("../config/config");
const { knapsack } = require("../utils/knapsack");
const { log } = require("../../../logging_middleware");

function fetchFromServer(path) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${config.testServerBase}${path}`);

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
            reject(new Error(`server returned ${res.statusCode} for ${path}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch (_) {
            reject(new Error("bad response from server"));
          }
        });
      },
    );

    req.on("error", reject);
    req.end();
  });
}

async function getDepots() {
  await log("backend", "info", "service", "fetching depots");
  try {
    const data = await fetchFromServer("/depots");
    await log("backend", "info", "service", `got ${data.depots.length} depots`);
    return data.depots;
  } catch (err) {
    await log(
      "backend",
      "error",
      "service",
      `depot fetch failed: ${err.message}`,
    );
    throw err;
  }
}

async function getVehicles() {
  await log("backend", "info", "service", "fetching vehicles");
  try {
    const data = await fetchFromServer("/vehicles");
    await log(
      "backend",
      "info",
      "service",
      `got ${data.vehicles.length} vehicles`,
    );
    return data.vehicles;
  } catch (err) {
    await log(
      "backend",
      "error",
      "service",
      `vehicle fetch failed: ${err.message}`,
    );
    throw err;
  }
}

async function buildSchedule() {
  await log("backend", "info", "service", "building schedule for all depots");
  const [depots, vehicles] = await Promise.all([getDepots(), getVehicles()]);

  const schedule = depots.map((depot) => {
    const result = knapsack(vehicles, depot.MechanicHours);
    return {
      depotId: depot.ID,
      mechanicHoursBudget: depot.MechanicHours,
      hoursUsed: result.hoursUsed,
      totalImpact: result.totalImpact,
      vehicleCount: result.selectedVehicles.length,
      selectedVehicles: result.selectedVehicles,
    };
  });

  await log("backend", "info", "service", "schedule done");
  return schedule;
}

async function buildScheduleForDepot(depotId) {
  await log(
    "backend",
    "info",
    "service",
    `building schedule for depot ${depotId}`,
  );
  const [depots, vehicles] = await Promise.all([getDepots(), getVehicles()]);

  const depot = depots.find((d) => d.ID === depotId);
  if (!depot) {
    await log("backend", "warn", "service", `depot ${depotId} not found`);
    return null;
  }

  const result = knapsack(vehicles, depot.MechanicHours);
  return {
    depotId: depot.ID,
    mechanicHoursBudget: depot.MechanicHours,
    hoursUsed: result.hoursUsed,
    totalImpact: result.totalImpact,
    vehicleCount: result.selectedVehicles.length,
    selectedVehicles: result.selectedVehicles,
  };
}

module.exports = { buildSchedule, buildScheduleForDepot };
