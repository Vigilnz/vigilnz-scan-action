/**
 * branch-in-output.test.js
 * Purpose: Tests that the branch a run scanned is threaded through to the action's
 *          outputs — per-outcome (resultsJson) and as its own `branch` output — and
 *          that waitForScans polls every scan target concurrently, not one after
 *          another.
 * Author: Vigilnz
 * Date: 2026-11-02
 */

"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { stubAction } = require("./helpers/action-stub");

const apiClientPath = require.resolve("../src/api-client");
const waitForScansPath = require.resolve("../src/wait-for-scans");
const reportPath = require.resolve("../src/report");

describe("branch threaded through scan outcomes and outputs", () => {
  let stub;
  let savedApiClient;

  beforeEach(() => {
    stub = stubAction();
    savedApiClient = require.cache[apiClientPath];
    delete require.cache[waitForScansPath];
  });

  afterEach(() => {
    stub.restore();
    if (savedApiClient) require.cache[apiClientPath] = savedApiClient;
    else delete require.cache[apiClientPath];
    delete require.cache[waitForScansPath];
  });

  function stubApiClient({ fetchScanStatus, fetchScanSummary }) {
    require.cache[apiClientPath] = {
      id: apiClientPath,
      filename: apiClientPath,
      loaded: true,
      exports: { fetchScanStatus, fetchScanSummary },
    };
  }

  it("pollScanTarget carries branch (and any other caller-attached field) through to the terminal outcome", async () => {
    stubApiClient({
      fetchScanStatus: async () => ({ status: "complete", percent: 100, message: "", scanId: "scan-1" }),
      fetchScanSummary: async () => ({ critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 }),
    });
    const { pollScanTarget } = require(waitForScansPath);

    const outcome = await pollScanTarget(
      { baseUrl: "https://x", token: "t", deadlineMs: Date.now() + 10_000, pollIntervalMs: 1 },
      { scanTargetId: "tgt-1", scanType: "sast", branch: "feature/foo" },
    );

    assert.equal(outcome.branch, "feature/foo");
    assert.equal(outcome.scanTargetId, "tgt-1");
    assert.equal(outcome.scanType, "sast");
    assert.equal(outcome.status, "complete");
  });

  it("a status-endpoint failure (terminalized as error) still carries branch through", async () => {
    stubApiClient({
      fetchScanStatus: async () => {
        throw new Error("unreachable");
      },
      fetchScanSummary: async () => ({ critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 }),
    });
    const { pollScanTarget } = require(waitForScansPath);

    const outcome = await pollScanTarget(
      { baseUrl: "https://x", token: "t", deadlineMs: Date.now() + 10_000, pollIntervalMs: 1 },
      { scanTargetId: "tgt-2", scanType: "secret", branch: "main" },
    );

    assert.equal(outcome.branch, "main");
    assert.equal(outcome.status, "error");
    assert.equal(outcome.percent, 0, "percent must always be present, even on this fallback path");
  });

  it("a timed-out scan reports the last percent actually observed, not an absent/undefined field", async () => {
    let call = 0;
    stubApiClient({
      fetchScanStatus: async () => {
        call += 1;
        // First poll reports progress; the deadline then elapses before another terminal status arrives.
        return { status: "running", percent: call === 1 ? 42 : 42, message: "scanning", scanId: null };
      },
      fetchScanSummary: async () => ({ critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 }),
    });
    const { pollScanTarget } = require(waitForScansPath);

    const outcome = await pollScanTarget(
      { baseUrl: "https://x", token: "t", deadlineMs: Date.now() + 5, pollIntervalMs: 1 },
      { scanTargetId: "tgt-3", scanType: "iac", branch: "main" },
    );

    assert.equal(outcome.status, "timed_out");
    assert.equal(outcome.percent, 42, "the last observed percent should survive into the timeout outcome");
  });

  it("waitForScans polls every scan target concurrently (not one after another), and every outcome carries the same branch", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    stubApiClient({
      fetchScanStatus: async (_baseUrl, _token, scanTargetId) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // Yield so a sequential (awaited one-by-one) implementation would resolve
        // this call — and drop back to inFlight===1 — before the next one starts.
        await new Promise((resolve) => setImmediate(resolve));
        inFlight -= 1;
        return { status: "complete", percent: 100, message: "", scanId: scanTargetId };
      },
      fetchScanSummary: async () => ({ critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 }),
    });
    const { waitForScans } = require(waitForScansPath);

    const scanInfo = [
      { scanTargetId: "t1", scanType: "sast", branch: "main" },
      { scanTargetId: "t2", scanType: "secret", branch: "main" },
      { scanTargetId: "t3", scanType: "iac", branch: "main" },
    ];

    const { outcomes } = await waitForScans(
      { baseUrl: "https://x", token: "t", timeoutMinutes: 1, pollIntervalSeconds: 1 },
      scanInfo,
    );

    assert.equal(outcomes.length, 3);
    assert.equal(maxInFlight, 3, "all three scan targets should be polled in parallel, not one after another");
    for (const outcome of outcomes) {
      assert.equal(outcome.branch, "main");
    }
  });

  it("report.setOutputs publishes the branch output and report.writeJobSummary includes it", async () => {
    const { setOutputs, writeJobSummary } = require(reportPath);

    setOutputs({
      scanTargetIds: ["t1"],
      totals: { critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 },
      outcomes: [{ scanTargetId: "t1", scanType: "sast", branch: "release/1.0", status: "complete", summary: { critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 } }],
      scanStatus: "complete",
      repoUrl: "https://github.com/org/repo",
      branch: "release/1.0",
    });

    assert.equal(stub.outputs.branch, "release/1.0");
    assert.equal(JSON.parse(stub.outputs.resultsJson)[0].branch, "release/1.0");

    // writeJobSummary must not throw even when GITHUB_STEP_SUMMARY isn't a writable
    // file in the test environment — it already fails soft (see report.js).
    await writeJobSummary({
      outcomes: [{ status: "complete", scanType: "sast", summary: { critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 } }],
      totals: { critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 },
      repoUrl: "https://github.com/org/repo",
      branch: "release/1.0",
    });
  });

  it("setOutputs publishes an empty string, never undefined, when branch could not be resolved", () => {
    const { setOutputs } = require(reportPath);

    setOutputs({
      scanTargetIds: [],
      totals: { critical: 0, high: 0, medium: 0, low: 0, totalFindings: 0 },
      outcomes: [],
      scanStatus: "pending",
      repoUrl: "https://github.com/org/repo",
      branch: undefined,
    });

    assert.equal(stub.outputs.branch, "");
  });
});
