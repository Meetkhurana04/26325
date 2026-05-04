"use strict";

require("dotenv").config();

const express = require("express");
const config = require("./config/config");
const notificationRoutes = require("./routes/notification");
const { log } = require("../../logging_middleware");

const app = express();

app.use(express.json());

app.use(async (req, _res, next) => {
  await log("backend", "info", "middleware", `${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/notifications", notificationRoutes);

app.use((req, res) => {
  res.status(404).json({ error: `${req.path} not found` });
});

app.use(async (err, _req, res, _next) => {
  await log("backend", "fatal", "handler", err.message);
  res.status(500).json({ error: "internal server error" });
});

app.listen(config.port, async () => {
  await log(
    "backend",
    "info",
    "config",
    `notification app up on port ${config.port}`,
  );
  console.log(`notification app running on http://localhost:${config.port}`);
});
