/**
 * constants.js
 * Purpose: Named constants shared across the Vigilnz GitHub Action — API base URLs,
 *          polling bounds, terminal scan statuses and severity ordering.
 * Author: Vigilnz
 * Date: 2026-08-06
 */

"use strict";

const DEV_DEFAULT_URL = "https://devapi.vigilnz.com";
const DEMO_DEFAULT_URL = "https://demoapi.vigilnz.com";
const PROD_DEFAULT_URL = "https://api.vigilnz.com";

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/** Wait-mode defaults and hard bounds (guard against typos causing runaway jobs). */
const DEFAULT_TIMEOUT_MINUTES = 30;
const MIN_TIMEOUT_MINUTES = 1;
const MAX_TIMEOUT_MINUTES = 360;
const DEFAULT_POLL_INTERVAL_SECONDS = 15;
const MIN_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 300;

/** Per-request network timeout so a hung socket cannot stall the whole job. */
const REQUEST_TIMEOUT_MS = 30 * MS_PER_SECOND;

/** Consecutive status-poll failures tolerated before giving up on a target. */
const MAX_CONSECUTIVE_POLL_ERRORS = 5;

/** Statuses returned by GET /chat/scan-status that mean "stop polling". */
const SCAN_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  COMPLETE: "complete",
  ERROR: "error",
  TIMED_OUT: "timed_out",
});

const TERMINAL_SCAN_STATUSES = Object.freeze([SCAN_STATUS.COMPLETE, SCAN_STATUS.ERROR]);

/** Severity gate ordering — index 0 is the most severe. */
const SEVERITY_LEVELS = Object.freeze(["critical", "high", "medium", "low"]);

/** Separator for the comma-separated includePaths / excludePaths inputs. */
const PATH_SCOPE_SEPARATOR = ",";

/** Bounds on the path-scope lists, mirroring the backend's own caps. */
const MAX_PATH_SCOPE_ENTRIES = 32;
const MAX_PATH_LENGTH = 512;

/**
 * Scan types that read repository files and therefore honour a path scope.
 * dast (targets a URL) and container (targets an image) are deliberately absent.
 */
const REPO_FILE_SCAN_TYPES = Object.freeze([
  "cve",
  "sbom",
  "sast",
  "iac",
  "secret",
  "aibom",
  "skillsecure",
]);

module.exports = {
  DEV_DEFAULT_URL,
  DEMO_DEFAULT_URL,
  PROD_DEFAULT_URL,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
  DEFAULT_TIMEOUT_MINUTES,
  MIN_TIMEOUT_MINUTES,
  MAX_TIMEOUT_MINUTES,
  DEFAULT_POLL_INTERVAL_SECONDS,
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
  REQUEST_TIMEOUT_MS,
  MAX_CONSECUTIVE_POLL_ERRORS,
  SCAN_STATUS,
  TERMINAL_SCAN_STATUSES,
  SEVERITY_LEVELS,
  PATH_SCOPE_SEPARATOR,
  MAX_PATH_SCOPE_ENTRIES,
  MAX_PATH_LENGTH,
  REPO_FILE_SCAN_TYPES,
};
