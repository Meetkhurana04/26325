"use strict";

const express = require("express");
const handler = require("../handlers/notification.handler");

const router = express.Router();

router.get("/", handler.listNotifications);
router.get("/priority", handler.getPriorityNotifications);
router.get("/unread-count", handler.getUnreadCount);
router.patch("/read-all", handler.markAllAsRead);
router.get("/:id", handler.getNotificationById);
router.patch("/:id/read", handler.markAsRead);

module.exports = router;
