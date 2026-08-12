/**
 * inputs.js
 * Purpose: Read, normalise and bound-check every action input; resolve the API base
 *          URL per environment and mask credential inputs in the workflow log.
 * Author: Vigilnz
 * Date: 2026-08-06
 */

"use strict";

const action = require("@actions/core");

const {
  DEV_DEFAULT_URL,
  DEMO_DEFAULT_URL,
  PROD_DEFAULT_URL,
  DEFAULT_TIMEOUT_MINUTES,
  MIN_TIMEOUT_MINUTES,
  MAX_TIMEOUT_MINUTES,
  DEFAULT_POLL_INTERVAL_SECONDS,
  MIN_POLL_INTERVAL_SECONDS,
  MAX_POLL_INTERVAL_SECONDS,
  SEVERITY_LEVELS,
} = require("./constants");

/**
 * Resolve the Vigilnz API base URL for the requested environment.
 *
 * @param {string} [env] - "dev" | "development" | "demo" | "prod" | "production"
 * @returns {string} Base URL (defaults to dev when unrecognised)
 */
function getBaseUrl(env) {
  switch (env?.toLowerCase()) {
    case "dev":
    case "development":
      return DEV_DEFAULT_URL;
    case "prod":
    case "production":
      return PROD_DEFAULT_URL;
    case "demo":
      return DEMO_DEFAULT_URL;
    default:
      return DEV_DEFAULT_URL;
  }
}

/**
 * Parse a lenient boolean input ("true"/"yes"/"1" are truthy, anything else false).
 *
 * @param {string} raw
 * @returns {boolean}
 */
function parseBoolean(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

/**
 * Parse a numeric input, clamping it into [min, max] and falling back on the default
 * when the value is missing or not a finite number.
 *
 * @param {string} raw
 * @param {{ fallback: number, min: number, max: number, label: string }} opts
 * @returns {number}
 */
function parseBoundedNumber(raw, { fallback, min, max, label }) {
  const trimmed = String(raw || "").trim();
  if (trimmed === "") return fallback;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    action.warning(`Invalid '${label}' value "${trimmed}" — falling back to ${fallback}.`);
    return fallback;
  }

  const clamped = Math.min(Math.max(parsed, min), max);
  if (clamped !== parsed) {
    action.warning(`'${label}' clamped from ${parsed} to ${clamped} (allowed ${min}-${max}).`);
  }
  return clamped;
}

/**
 * Normalise the failOnSeverity gate. Empty/"none" disables gating.
 *
 * @param {string} raw
 * @returns {string|null} One of SEVERITY_LEVELS, or null when gating is disabled
 */
function parseSeverityGate(raw) {
  const normalized = String(raw || "").trim().toLowerCase();
  if (normalized === "" || normalized === "none") return null;

  if (!SEVERITY_LEVELS.includes(normalized)) {
    action.warning(
      `Unknown 'failOnSeverity' value "${normalized}" — expected one of ` +
        `${SEVERITY_LEVELS.join(", ")}, none. Severity gating disabled.`
    );
    return null;
  }
  return normalized;
}

/**
 * Map user-facing scan type aliases onto the scan type identifiers the API expects.
 *
 * @param {string} scanTypes - Comma-separated list
 * @returns {string[]}
 */
function normalizeScanTypes(scanTypes) {
  if (!scanTypes || scanTypes.trim() === "") return [];

  return scanTypes.split(",").flatMap((type) => {
    switch (type?.toLowerCase().trim()) {
      case "sca":
        return "cve";
      case "secret scan":
        return "secret";
      case "iac scan":
        return "iac";
      case "container scan":
        return "container";
      default:
        return type?.trim()?.toLowerCase();
    }
  });
}

/**
 * Collect every container-registry input into one context object and register the
 * credential values as secrets so they are redacted from the workflow log.
 *
 * @returns {Record<string, string>}
 */
function readContainerContext() {
  const containerToken = action.getInput("containerToken");
  const containerPassword = action.getInput("containerPassword");

  if (containerToken) action.setSecret(containerToken);
  if (containerPassword) action.setSecret(containerPassword);

  return {
    containerImage: action.getInput("containerImage"),
    containerProvider: action.getInput("containerProvider"),
    containerRegistryType: action.getInput("containerRegistryType"),
    containerRegistryUrl: action.getInput("containerRegistryUrl"),
    containerAuthType: action.getInput("containerAuthType"),
    containerToken,
    containerUsername: action.getInput("containerUsername"),
    containerPassword,
  };
}

/**
 * Read every action input into a single normalised config object.
 *
 * @returns {object} Resolved action configuration
 */
function readInputs() {
  const apiKey = action.getInput("vigilnzApiKey");
  if (apiKey) action.setSecret(apiKey);

  const environment = action.getInput("environment");
  const scanTypes = action.getInput("scanTypes");

  return {
    apiKey,
    scanTypes,
    scanTypesInList: normalizeScanTypes(scanTypes),
    projectName: action.getInput("projectName"),
    environment,
    baseUrl: getBaseUrl(environment),

    dastScanType: action.getInput("dastScanType"),
    dastTargetUrl: action.getInput("dastTargetUrl"),
    containerCtx: readContainerContext(),

    // Raw here; normalized and validated by buildPathScope in path-scope.js.
    includePaths: action.getInput("includePaths"),
    excludePaths: action.getInput("excludePaths"),

    shouldWaitForCompletion: parseBoolean(action.getInput("waitForCompletion")),
    timeoutMinutes: parseBoundedNumber(action.getInput("timeoutMinutes"), {
      fallback: DEFAULT_TIMEOUT_MINUTES,
      min: MIN_TIMEOUT_MINUTES,
      max: MAX_TIMEOUT_MINUTES,
      label: "timeoutMinutes",
    }),
    pollIntervalSeconds: parseBoundedNumber(action.getInput("pollIntervalSeconds"), {
      fallback: DEFAULT_POLL_INTERVAL_SECONDS,
      min: MIN_POLL_INTERVAL_SECONDS,
      max: MAX_POLL_INTERVAL_SECONDS,
      label: "pollIntervalSeconds",
    }),
    failOnSeverity: parseSeverityGate(action.getInput("failOnSeverity")),
    shouldFailOnScanError: parseBoolean(action.getInput("failOnScanError") || "true"),
  };
}

module.exports = {
  getBaseUrl,
  parseBoolean,
  parseBoundedNumber,
  parseSeverityGate,
  normalizeScanTypes,
  readInputs,
};
