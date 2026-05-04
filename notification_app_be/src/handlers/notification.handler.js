"use strict";

const service = require("../services/notification.service");
const { log } = require("../../../logging_middleware");

async function listNotifications(req, res) {
  const { type, page, limit } = req.query;
  try {
    res.json(await service.listNotifications(type, page, limit));
  } catch (err) {
    await log(
      "backend",
      "error",
      "handler",
      `listNotifications: ${err.message}`,
    );
    res.status(500).json({ error: "could not fetch notifications" });
  }
}

async function getNotificationById(req, res) {
  try {
    const notification = await service.getNotificationById(req.params.id);
    if (!notification)
      return res
        .status(404)
        .json({ error: `notification ${req.params.id} not found` });
    res.json(notification);
  } catch (err) {
    await log("backend", "error", "handler", `getById: ${err.message}`);
    res.status(500).json({ error: "could not fetch notification" });
  }
}

async function markAsRead(req, res) {
  try {
    const ok = await service.markAsRead(req.params.id);
    if (!ok)
      return res
        .status(404)
        .json({ error: `notification ${req.params.id} not found` });
    res.json({ message: "marked as read", id: req.params.id });
  } catch (err) {
    await log("backend", "error", "handler", `markAsRead: ${err.message}`);
    res.status(500).json({ error: "could not update notification" });
  }
}

async function markAllAsRead(req, res) {
  try {
    const count = await service.markAllAsRead();
    res.json({ message: `${count} notifications marked as read` });
  } catch (err) {
    await log("backend", "error", "handler", `markAllAsRead: ${err.message}`);
    res.status(500).json({ error: "could not update notifications" });
  }
}

async function getUnreadCount(req, res) {
  try {
    res.json({ unreadCount: await service.getUnreadCount() });
  } catch (err) {
    await log("backend", "error", "handler", `getUnreadCount: ${err.message}`);
    res.status(500).json({ error: "could not get unread count" });
  }
}

async function getPriorityNotifications(req, res) {
  const n = parseInt(req.query.n) || 10;
  try {
    res.json({
      top: n,
      notifications: await service.getPriorityNotifications(n),
    });
  } catch (err) {
    await log("backend", "error", "handler", `getPriority: ${err.message}`);
    res.status(500).json({ error: "could not fetch priority notifications" });
  }
}

module.exports = {
  listNotifications,
  getNotificationById,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  getPriorityNotifications,
};
