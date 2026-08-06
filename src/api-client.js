/**
 * api-client.js
 * Purpose: Thin typed wrapper over the Vigilnz REST endpoints used by the action —
 *          API-key exchange, multi-scan dispatch, scan-status polling and result summary.
 * Author: Vigilnz
 * Date: 2026-08-06
 */

"use strict";

const { REQUEST_TIMEOUT_MS } = require("./constants");

/**
 * Error carrying the HTTP status so callers can distinguish transient from fatal failures.
 */
class VigilnzApiError extends Error {
  /**
   * @param {string} message
   * @param {number|null} status
   */
  constructor(message, status) {
    super(message);
    this.name = "VigilnzApiError";
    this.status = status;
  }
}

/**
 * Issue a JSON request with a bounded timeout and parse the JSON body.
 *
 * @param {string} url
 * @param {{method?: string, token?: string, body?: unknown}} options
 * @returns {Promise<unknown>} Parsed JSON body
 * @throws {VigilnzApiError} On non-2xx responses, network errors or timeouts
 */
async function requestJson(url, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new VigilnzApiError(`Request to ${url} failed: ${error.message}`, null);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // Non-JSON body — surfaced through the status check below.
  }

  if (!response.ok) {
    const detail = data?.message || data?.error || response.statusText;
    throw new VigilnzApiError(`${method} ${url} returned ${response.status}: ${detail}`, response.status);
  }

  return data;
}

/**
 * Exchange the Vigilnz API key for a short-lived access token.
 *
 * @param {string} baseUrl
 * @param {string} apiKey
 * @returns {Promise<string>} Access token
 * @throws {VigilnzApiError} When the exchange fails or no token is returned
 */
async function authenticate(baseUrl, apiKey) {
  const data = await requestJson(`${baseUrl}/auth/api-key`, {
    method: "POST",
    body: { apiKey },
  });

  if (!data?.access_token) {
    throw new VigilnzApiError("No valid access token received from Vigilnz API", null);
  }
  return data.access_token;
}

/**
 * Queue the scans. Returns immediately with the created scan-target receipts —
 * the scans themselves run asynchronously on the Vigilnz platform.
 *
 * @param {string} baseUrl
 * @param {string} token
 * @param {object} scanApiRequest
 * @returns {Promise<{repoUrl?: string, repoName?: string, scanInfo?: Array<{scanTargetId: string, scanType: string}>, errors?: unknown[]}>}
 */
async function submitScan(baseUrl, token, scanApiRequest) {
  return requestJson(`${baseUrl}/scan-targets/multi-scan`, {
    method: "POST",
    token,
    body: scanApiRequest,
  });
}

/**
 * Fetch live progress for one scan target.
 *
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} scanTargetId
 * @returns {Promise<{status: string, percent: number, message: string, scanId: string|null}>}
 */
async function fetchScanStatus(baseUrl, token, scanTargetId) {
  const data = await requestJson(
    `${baseUrl}/chat/scan-status/${encodeURIComponent(scanTargetId)}`,
    { token }
  );

  return {
    status: String(data?.status || "pending").toLowerCase(),
    percent: Number(data?.percent) || 0,
    message: data?.message || "",
    scanId: data?.scanId || null,
  };
}

/**
 * Fetch the normalised severity summary for a completed scan.
 *
 * @param {string} baseUrl
 * @param {string} token
 * @param {string} scanId
 * @returns {Promise<{critical: number, high: number, medium: number, low: number, totalFindings: number}>}
 */
async function fetchScanSummary(baseUrl, token, scanId) {
  const data = await requestJson(
    `${baseUrl}/scan-results/by-scan-id/${encodeURIComponent(scanId)}`,
    { token }
  );

  const summary = data?.data?.summary || {};
  return {
    critical: Number(summary.critical) || 0,
    high: Number(summary.high) || 0,
    medium: Number(summary.medium) || 0,
    low: Number(summary.low) || 0,
    totalFindings: Number(summary.totalFindings) || Number(summary.totalVulnerabilities) || 0,
  };
}

module.exports = {
  VigilnzApiError,
  requestJson,
  authenticate,
  submitScan,
  fetchScanStatus,
  fetchScanSummary,
};
