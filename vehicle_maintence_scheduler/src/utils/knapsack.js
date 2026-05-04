"use strict";

function knapsack(vehicles, capacity) {
  const n = vehicles.length;

  const dp = [];
  for (let i = 0; i <= n; i++) {
    dp.push(new Array(capacity + 1).fill(0));
  }

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = vehicles[i - 1];
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];
      if (Duration <= w && dp[i - 1][w - Duration] + Impact > dp[i][w]) {
        dp[i][w] = dp[i - 1][w - Duration] + Impact;
      }
    }
  }

  // backtrack to find which vehicles got picked
  const selected = [];
  let rem = capacity;
  for (let i = n; i >= 1; i--) {
    if (dp[i][rem] !== dp[i - 1][rem]) {
      selected.push(vehicles[i - 1]);
      rem -= vehicles[i - 1].Duration;
    }
  }

  return {
    totalImpact: dp[n][capacity],
    hoursUsed: selected.reduce((s, v) => s + v.Duration, 0),
    hoursAvailable: capacity,
    selectedVehicles: selected,
  };
}

module.exports = { knapsack };
