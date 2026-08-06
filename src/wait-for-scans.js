/**
 * wait-for-scans.js
 * Purpose: Poll queued scan targets until every one reaches a terminal state (or the
 *          deadline passes), collect severity summaries and evaluate the severity gate.
 * Author: Vigilnz
 * Date: 2026-08-06
 */

"use strict";

const action = require("@actions/core");
const { setTimeout: sleep } = require("node:timers/promises");

const {
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
  MAX_CONSECUTIVE_POLL_ERRORS,
  SCAN_STATUS,
  TERMINAL_SCAN_STATUSES,
  SEVERITY_LEVELS,
} = require("./constants");
const { fetchScanStatus, fetchScanSummary } = require("./api-client");

const EMPTY_SUMMARY = Object.freeze({
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  totalFindings: 0,
});

/**
 * Poll one scan target until it reaches a terminal state or the deadline passes.
 *
 * @param {{baseUrl: string, token: string, deadlineMs: number, pollIntervalMs: number}} ctx
 * @param {{scanTargetId: string, scanType: string}} target
 * @returns {Promise<{scanTargetId: string, scanType: string, status: string, message: string, scanId: string|null}>}
 */
async function pollScanTarget(ctx, target) {
  const { baseUrl, token, deadlineMs, pollIntervalMs } = ctx;
  const { scanTargetId, scanType } = target;

  let consecutiveErrors = 0;
  let lastPercent = -1;

  while (Date.now() < deadlineMs) {
    try {
      const progress = await fetchScanStatus(baseUrl, token, scanTargetId);
      consecutiveErrors = 0;

      if (progress.percent !== lastPercent) {
        lastPercent = progress.percent;
        action.info(`  ${scanType}: ${progress.status} ${progress.percent}% — ${progress.message}`);
      }

      if (TERMINAL_SCAN_STATUSES.includes(progress.status)) {
        return { scanTargetId, scanType, ...progress };
      }
    } catch (error) {
      consecutiveErrors += 1;
      action.warning(
        `Status poll ${consecutiveErrors}/${MAX_CONSECUTIVE_POLL_ERRORS} failed for ` +
          `${scanType} (${scanTargetId}): ${error.message}`
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
        return {
          scanTargetId,
          scanType,
          status: SCAN_STATUS.ERROR,
          message: "Status endpoint unreachable",
          scanId: null,
        };
      }
    }

    await sleep(pollIntervalMs);
  }

  return {
    scanTargetId,
    scanType,
    status: SCAN_STATUS.TIMED_OUT,
    message: "Timed out waiting for scan to complete",
    scanId: null,
  };
}

/**
 * Attach the severity summary to a completed scan. Summary-fetch failures degrade to
 * zero counts with a warning rather than failing the run outright.
 *
 * @param {{baseUrl: string, token: string}} ctx
 * @param {object} outcome - Result of pollScanTarget
 * @returns {Promise<object>} Outcome with a `summary` field
 */
async function attachSummary(ctx, outcome) {
  if (outcome.status !== SCAN_STATUS.COMPLETE || !outcome.scanId) {
    return { ...outcome, summary: { ...EMPTY_SUMMARY } };
  }

  try {
    const summary = await fetchScanSummary(ctx.baseUrl, ctx.token, outcome.scanId);
    return { ...outcome, summary };
  } catch (error) {
    action.warning(
      `Could not read findings summary for ${outcome.scanType} (${outcome.scanId}): ${error.message}`
    );
    return { ...outcome, summary: { ...EMPTY_SUMMARY } };
  }
}

/**
 * Sum severity counts across every scan outcome.
 *
 * @param {Array<{summary: object}>} outcomes
 * @returns {{critical: number, high: number, medium: number, low: number, totalFindings: number}}
 */
function aggregateSummaries(outcomes) {
  return outcomes.reduce(
    (totals, outcome) => ({
      critical: totals.critical + outcome.summary.critical,
      high: totals.high + outcome.summary.high,
      medium: totals.medium + outcome.summary.medium,
      low: totals.low + outcome.summary.low,
      totalFindings: totals.totalFindings + outcome.summary.totalFindings,
    }),
    { ...EMPTY_SUMMARY }
  );
}

/**
 * Count findings at or above the configured gate severity.
 *
 * @param {object} totals
 * @param {string} failOnSeverity - One of SEVERITY_LEVELS
 * @returns {number}
 */
function countAtOrAboveSeverity(totals, failOnSeverity) {
  const gateIndex = SEVERITY_LEVELS.indexOf(failOnSeverity);
  return SEVERITY_LEVELS.slice(0, gateIndex + 1).reduce(
    (sum, level) => sum + (totals[level] || 0),
    0
  );
}

/**
 * Wait for every queued scan to finish, then return per-scan outcomes and totals.
 *
 * @param {{baseUrl: string, token: string, timeoutMinutes: number, pollIntervalSeconds: number}} config
 * @param {Array<{scanTargetId: string, scanType: string}>} scanInfo
 * @returns {Promise<{outcomes: object[], totals: object}>}
 */
async function waitForScans(config, scanInfo) {
  const { baseUrl, token, timeoutMinutes, pollIntervalSeconds } = config;
  const ctx = {
    baseUrl,
    token,
    deadlineMs: Date.now() + timeoutMinutes * SECONDS_PER_MINUTE * MS_PER_SECOND,
    pollIntervalMs: pollIntervalSeconds * MS_PER_SECOND,
  };

  action.info(
    `Waiting for ${scanInfo.length} scan(s) — polling every ${pollIntervalSeconds}s, ` +
      `timeout ${timeoutMinutes}m.`
  );

  const outcomes = await Promise.all(
    scanInfo.map(async (target) => attachSummary(ctx, await pollScanTarget(ctx, target)))
  );

  return { outcomes, totals: aggregateSummaries(outcomes) };
}

module.exports = {
  waitForScans,
  aggregateSummaries,
  countAtOrAboveSeverity,
  pollScanTarget,
  EMPTY_SUMMARY,
};
