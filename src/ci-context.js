/**
 * ci-context.js
 * Purpose: Build the CI provenance payload (run id, build number, commit, workflow …) that
 *          the action sends with every scan so the platform can attribute results to the
 *          exact GitHub Actions run that produced them.
 * Author: Vigilnz
 * Date: 2026-08-11
 */

"use strict";

/** Provider token stored alongside the metadata so other CI systems can be added later. */
const CI_PROVIDER = "github-actions";

/**
 * Upper bound for any single metadata value. Keeps a hostile or misconfigured runner from
 * writing unbounded strings into the scan-target document (the backend caps this too).
 */
const MAX_FIELD_LENGTH = 512;

/**
 * Read an environment variable as a trimmed, length-capped string.
 *
 * @param {string} name - Environment variable name
 * @returns {string} Trimmed value, or "" when unset
 */
function readEnv(name) {
  return String(process.env[name] || "").trim().slice(0, MAX_FIELD_LENGTH);
}

/**
 * Build the run URL GitHub does not expose directly as an env var.
 *
 * @param {string} serverUrl - e.g. https://github.com
 * @param {string} repository - e.g. owner/repo
 * @param {string} runId - Workflow run id
 * @param {string} runAttempt - Workflow run attempt
 * @returns {string} Deep link to the run, or "" when the parts are missing
 */
function buildRunUrl(serverUrl, repository, runId, runAttempt) {
  if (!serverUrl || !repository || !runId) return "";

  const base = `${serverUrl}/${repository}/actions/runs/${runId}`;
  return runAttempt ? `${base}/attempts/${runAttempt}` : base;
}

/**
 * Collect the CI provenance metadata for the current workflow run.
 *
 * Every field is optional — a runner missing one (or a local `act` run) simply omits it
 * rather than sending an empty string. Returns null when nothing could be resolved, so the
 * caller can leave the request body untouched.
 *
 * @returns {Record<string, string>|null} CI context, or null when no metadata is available
 */
function buildCiContext() {
  const repository = readEnv("GITHUB_REPOSITORY");
  const runId = readEnv("GITHUB_RUN_ID");
  const runAttempt = readEnv("GITHUB_RUN_ATTEMPT");

  const candidate = {
    provider: CI_PROVIDER,
    runId,
    // GITHUB_RUN_NUMBER is the human-facing build number shown in the Actions UI.
    buildNumber: readEnv("GITHUB_RUN_NUMBER"),
    runAttempt,
    commit: readEnv("GITHUB_SHA"),
    repository,
    ref: readEnv("GITHUB_REF"),
    workflow: readEnv("GITHUB_WORKFLOW"),
    jobName: readEnv("GITHUB_JOB"),
    eventName: readEnv("GITHUB_EVENT_NAME"),
    actor: readEnv("GITHUB_ACTOR"),
    runUrl: buildRunUrl(readEnv("GITHUB_SERVER_URL"), repository, runId, runAttempt),
  };

  const ciContext = {};
  for (const [key, value] of Object.entries(candidate)) {
    if (value) ciContext[key] = value;
  }

  // `provider` alone carries no provenance — treat that as "no CI metadata".
  return Object.keys(ciContext).length > 1 ? ciContext : null;
}

module.exports = { buildCiContext, buildRunUrl, CI_PROVIDER, MAX_FIELD_LENGTH };
