"use strict";

const {
  buildSchedule,
  buildScheduleForDepot,
} = require("../services/schedule.service");
const { log } = require("../../../logging_middleware");

async function getAllSchedules(req, res) {
  await log("backend", "info", "handler", "GET /schedule");
  try {
    const schedule = await buildSchedule();
    res.json({ schedule });
  } catch (err) {
    await log("backend", "error", "handler", err.message);
    res
      .status(500)
      .json({ error: "failed to compute schedule", details: err.message });
  }
}

async function getScheduleByDepot(req, res) {
  const depotId = parseInt(req.params.depotId);

  if (isNaN(depotId)) {
    await log(
      "backend",
      "warn",
      "handler",
      `bad depotId: ${req.params.depotId}`,
    );
    return res.status(400).json({ error: "depotId must be a number" });
  }

  await log("backend", "info", "handler", `GET /schedule/${depotId}`);
  try {
    const result = await buildScheduleForDepot(depotId);
    if (!result)
      return res.status(404).json({ error: `depot ${depotId} not found` });
    res.json(result);
  } catch (err) {
    await log("backend", "error", "handler", err.message);
    res
      .status(500)
      .json({ error: "failed to compute schedule", details: err.message });
  }
}

module.exports = { getAllSchedules, getScheduleByDepot };
