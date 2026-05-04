"use strict";

const typeWeight = { Placement: 3, Result: 2, Event: 1 };

function compareNotifications(a, b) {
  const wa = typeWeight[a.Type] || 0;
  const wb = typeWeight[b.Type] || 0;
  if (wa !== wb) return wb - wa;
  return new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime();
}

function getTopN(notifications, n) {
  const limit = Number.isInteger(n) && n > 0 ? n : 10;
  return notifications.slice().sort(compareNotifications).slice(0, limit);
}

module.exports = { getTopN, compareNotifications, typeWeight };
