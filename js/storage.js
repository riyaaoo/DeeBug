/**
 * DeeBug — Local Persistence Adapter
 * Uses project-specific localStorage prefix `deebug_v1_`.
 * Structured as an async-friendly adapter so it can later swap to cloud/account APIs.
 */
(function (global) {
  'use strict';

  const DeeBug = (global.DeeBug = global.DeeBug || {});
  const PREFIX = DeeBug.Config.STORAGE_PREFIX;

  const KEYS = {
    settings: PREFIX + 'settings',
    stats: PREFIX + 'stats',
  };

  const DEFAULT_SETTINGS = {
    playerName: 'DeeBug',
    muted: false,
    controlMode: 'auto', // auto | pointer | keys
  };

  const DEFAULT_STATS = {
    bestPoints: 0,
    highestRank: 1,
    totalBugsEaten: 0,
    victories: 0,
    ultimateVictories: 0,
    mostSkinsInRun: 1,
  };

  function safeRead(key, fallback) {
    try {
      const raw = global.localStorage.getItem(key);
      if (!raw) return Object.assign({}, fallback);
      const parsed = JSON.parse(raw);
      return Object.assign({}, fallback, parsed);
    } catch (_err) {
      return Object.assign({}, fallback);
    }
  }

  function safeWrite(key, value) {
    try {
      global.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_err) {
      return false;
    }
  }

  const Storage = {
    loadSettings() {
      return safeRead(KEYS.settings, DEFAULT_SETTINGS);
    },

    saveSettings(patch) {
      const next = Object.assign(this.loadSettings(), patch);
      safeWrite(KEYS.settings, next);
      return next;
    },

    loadStats() {
      return safeRead(KEYS.stats, DEFAULT_STATS);
    },

    recordRun(summary) {
      const current = this.loadStats();
      const updated = {
        bestPoints: Math.max(current.bestPoints, Math.floor(summary.peakPoints || 0)),
        highestRank: Math.max(current.highestRank, summary.rank || 1),
        totalBugsEaten: current.totalBugsEaten + (summary.bugsEaten || 0),
        victories: current.victories + (summary.won ? 1 : 0),
        ultimateVictories: current.ultimateVictories + (summary.ultimate ? 1 : 0),
        mostSkinsInRun: Math.max(current.mostSkinsInRun, summary.skinsOwned || 1),
      };
      safeWrite(KEYS.stats, updated);
      return updated;
    },
  };

  DeeBug.Storage = Storage;
})(window);
