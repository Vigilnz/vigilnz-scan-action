/**
 * index.js
 * Purpose: Entrypoint for the Vigilnz Security Scan GitHub Action — validates inputs,
 *          queues the scans and (optionally) waits for completion, publishes outputs
 *          and gates the job on finding severity.
 * Author: Vigilnz
 * Date: 2026-08-06
 */

"use strict";

const action = require("@actions/core");

const { SCAN_STATUS } = require("./constants");
const { readInputs } = require("./inputs");
const { buildDastContext, buildContainerContext } = require("./scan-context");
const { authenticate, submitScan } = require("./api-client");
const { waitForScans, countAtOrAboveSeverity, EMPTY_SUMMARY } = require("./wait-for-scans");
const { setOutputs, writeJobSummary, logTotals } = require("./report");

const SCAN_TYPE = Object.freeze({ DAST: "dast", CONTAINER: "container" });

/**
 * Resolve the repository URL of the workflow this action is running in.
 *
 * @returns {string}
 */
function resolveRepoUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  const serverUrl = process.env.GITHUB_SERVER_URL;
  return `${serverUrl}/${repo}`;
}

/**
 * Validate the inputs that are mandatory regardless of scan type.
 *
 * @param {object} config - Result of readInputs()
 * @returns {boolean} False when the run has already been failed
 */
function hasValidRequiredInputs(config) {
  if (!config.apiKey) {
    action.setFailed("Vigilnz API Key is Required");
    return false;
  }
  if (!config.scanTypes) {
    action.setFailed("Scan Types not mentioned");
    return false;
  }
  if (
    config.scanTypesInList.includes(SCAN_TYPE.DAST) &&
    (!config.dastScanType || !config.dastTargetUrl)
  ) {
    action.setFailed("DAST scan requires both 'dastTargetUrl' and 'dastScanType'");
    return false;
  }
  return true;
}

/**
 * Assemble the POST /scan-targets/multi-scan request body.
 *
 * @param {object} config
 * @param {string} repoUrl
 * @returns {object|null} Request body, or null when a scan context failed validation
 */
function buildScanRequest(config, repoUrl) {
  const scanApiRequest = {
    scanTypes: config.scanTypesInList,
    gitRepoUrl: repoUrl,
    projectName: config.projectName || "",
  };

  if (config.scanTypesInList.includes(SCAN_TYPE.DAST)) {
    const dastContext = buildDastContext(config.dastScanType, config.dastTargetUrl);
    if (!dastContext) return null;
    scanApiRequest.scanContext = dastContext;
  }

  if (config.scanTypesInList.includes(SCAN_TYPE.CONTAINER)) {
    const containerContext = buildContainerContext(config.containerCtx);
    if (!containerContext) return null;
    scanApiRequest.containerScanContext = containerContext;
  }

  return scanApiRequest;
}

/**
 * Publish outputs for a queue-only run (waitForCompletion disabled).
 *
 * @param {Array<{scanTargetId: string, scanType: string}>} scanInfo
 * @param {string} repoUrl
 * @returns {void}
 */
function reportQueuedOnly(scanInfo, repoUrl) {
  setOutputs({
    scanTargetIds: scanInfo.map((entry) => entry.scanTargetId),
    totals: { ...EMPTY_SUMMARY },
    outcomes: scanInfo.map((entry) => ({ ...entry, status: SCAN_STATUS.PENDING })),
    scanStatus: SCAN_STATUS.PENDING,
    repoUrl,
  });

  action.info(
    `Queued ${scanInfo.length} scan(s). Not waiting for results — ` +
      "set 'waitForCompletion: true' to block until the scans finish."
  );
}

/**
 * Decide the job outcome from the scan outcomes and the configured severity gate.
 *
 * @param {object} config
 * @param {{outcomes: object[], totals: object}} result
 * @returns {string} Aggregate scan status
 */
function evaluateGates(config, { outcomes, totals }) {
  const failedScans = outcomes.filter((outcome) => outcome.status !== SCAN_STATUS.COMPLETE);
  const aggregateStatus = failedScans.length === 0 ? SCAN_STATUS.COMPLETE : failedScans[0].status;

  logTotals(totals);

  if (failedScans.length > 0) {
    const detail = failedScans
      .map((outcome) => `${outcome.scanType}: ${outcome.status} (${outcome.message})`)
      .join("; ");

    if (config.shouldFailOnScanError) {
      action.setFailed(`${failedScans.length} scan(s) did not complete — ${detail}`);
      return aggregateStatus;
    }
    action.warning(`${failedScans.length} scan(s) did not complete — ${detail}`);
  }

  if (config.failOnSeverity) {
    const breaching = countAtOrAboveSeverity(totals, config.failOnSeverity);
    if (breaching > 0) {
      action.setFailed(
        `Severity gate failed: ${breaching} finding(s) at or above ` +
          `'${config.failOnSeverity}' severity.`
      );
    } else {
      action.info(`Severity gate passed — no findings at or above '${config.failOnSeverity}'.`);
    }
  }

  return aggregateStatus;
}

/**
 * Queue the scans, then either return immediately or wait for results and gate the job.
 *
 * @param {object} config
 * @param {object} scanApiRequest
 * @param {string} repoUrl
 * @returns {Promise<void>}
 */
async function runScan(config, scanApiRequest, repoUrl) {
  const token = await authenticate(config.baseUrl, config.apiKey);
  action.info("Access token fetched successfully.");

  const data = await submitScan(config.baseUrl, token, scanApiRequest);
  const scanInfo = Array.isArray(data?.scanInfo) ? data.scanInfo : [];

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    for (const err of data.errors) {
      action.warning(`Backend could not queue ${err.scanType}: ${err.message}`);
    }
  }

  if (scanInfo.length === 0) {
    action.setFailed("Scan submitted but no scan targets were created.");
    return;
  }

  action.info(`Scans queued: ${scanInfo.map((e) => e.scanType).join(", ")}`);

  if (!config.shouldWaitForCompletion) {
    reportQueuedOnly(scanInfo, repoUrl);
    return;
  }

  const result = await waitForScans({ ...config, token }, scanInfo);
  const scanStatus = evaluateGates(config, result);

  setOutputs({
    scanTargetIds: scanInfo.map((entry) => entry.scanTargetId),
    totals: result.totals,
    outcomes: result.outcomes,
    scanStatus,
    repoUrl,
  });
  await writeJobSummary({ outcomes: result.outcomes, totals: result.totals, repoUrl });
}

/**
 * Action entrypoint.
 *
 * @returns {Promise<void>}
 */
async function runVigilnzScan() {
  try {
    const config = readInputs();
    if (!hasValidRequiredInputs(config)) return;

    const repoUrl = resolveRepoUrl();
    action.info(`GitHub repo url : ${repoUrl}`);
    action.info(`Scan types : ${config.scanTypesInList.join(", ")}`);

    const scanApiRequest = buildScanRequest(config, repoUrl);
    if (!scanApiRequest) return;

    await runScan(config, scanApiRequest, repoUrl);
  } catch (error) {
    action.setFailed(`Scan failed: ${error.message}`);
  }
}

runVigilnzScan();

module.exports = { runVigilnzScan, resolveRepoUrl, buildScanRequest, evaluateGates };
