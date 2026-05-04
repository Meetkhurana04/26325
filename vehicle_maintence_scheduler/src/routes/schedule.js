"use strict";

const express = require("express");
const {
  getAllSchedules,
  getScheduleByDepot,
} = require("../handlers/schedule.handler");

const router = express.Router();

router.get("/", getAllSchedules);
router.get("/:depotId", getScheduleByDepot);

module.exports = router;
