/**
 * report.js
 * Purpose: Publish action outputs and render the GitHub job summary table for a
 *          completed (or queued-only) Vigilnz scan run.
 * Author: Vigilnz
 * Date: 2026-08-06
 */

"use strict";

const action = require("@actions/core");

const { SCAN_STATUS } = require("./constants");
const { EMPTY_SUMMARY } = require("./wait-for-scans");

const STATUS_ICON = Object.freeze({
  [SCAN_STATUS.COMPLETE]: "✅",
  [SCAN_STATUS.ERROR]: "❌",
  [SCAN_STATUS.TIMED_OUT]: "⏱️",
});

/**
 * Set every action output. Always called, including in queue-only mode, so downstream
 * steps can rely on the outputs existing.
 *
 * @param {{scanTargetIds: string[], totals: object, outcomes: object[], scanStatus: string, repoUrl: string, branch?: string}} report
 * @returns {void}
 */
function setOutputs({ scanTargetIds, totals, outcomes, scanStatus, repoUrl, branch }) {
  action.setOutput("scanTargetIds", scanTargetIds.join(","));
  action.setOutput("scanStatus", scanStatus);
  action.setOutput("repoUrl", repoUrl);
  // The branch these scans were triggered for — same value on every outcome below,
  // since one workflow run scans exactly one branch; exposed as its own output too
  // so a downstream step can read it without parsing resultsJson.
  action.setOutput("branch", branch || "");
  action.setOutput("criticalCount", String(totals.critical));
  action.setOutput("highCount", String(totals.high));
  action.setOutput("mediumCount", String(totals.medium));
  action.setOutput("lowCount", String(totals.low));
  action.setOutput("totalFindings", String(totals.totalFindings));
  action.setOutput("resultsJson", JSON.stringify(outcomes));
}

/**
 * Render the per-scan result table into the GitHub job summary.
 *
 * @param {{outcomes: object[], totals: object, repoUrl: string, branch?: string}} report
 * @returns {Promise<void>}
 */
async function writeJobSummary({ outcomes, totals, repoUrl, branch }) {
  try {
    const rows = outcomes.map((outcome) => [
      `${STATUS_ICON[outcome.status] || "⚪"} ${outcome.scanType}`,
      outcome.status,
      String(outcome.summary.critical),
      String(outcome.summary.high),
      String(outcome.summary.medium),
      String(outcome.summary.low),
      String(outcome.summary.totalFindings),
    ]);

    await action.summary
      .addHeading("Vigilnz Security Scan", 2)
      .addRaw(`Repository: ${repoUrl}`, true)
      .addRaw(`Branch: ${branch || "(not resolved — platform used the repo default)"}`, true)
      .addTable([
        ["Scan", "Status", "Critical", "High", "Medium", "Low", "Total"].map((header) => ({
          data: header,
          header: true,
        })),
        ...rows,
        [
          "<strong>Total</strong>",
          "—",
          String(totals.critical),
          String(totals.high),
          String(totals.medium),
          String(totals.low),
          String(totals.totalFindings),
        ],
      ])
      .write();
  } catch (error) {
    // A summary write failure must never fail an otherwise-passing scan.
    action.warning(`Could not write job summary: ${error.message}`);
  }
}

/**
 * Log the severity totals to the workflow console.
 *
 * @param {object} totals
 * @returns {void}
 */
function logTotals(totals) {
  action.info(
    `Findings — critical: ${totals.critical}, high: ${totals.high}, ` +
      `medium: ${totals.medium}, low: ${totals.low}, total: ${totals.totalFindings}`
  );
}

module.exports = { setOutputs, writeJobSummary, logTotals, EMPTY_SUMMARY };
