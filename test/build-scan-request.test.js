/**
 * build-scan-request.test.js
 * Purpose: Tests for the POST /scan-targets/multi-scan request body — chiefly that adding
 *          path scope did not change the body of an unscoped run, and that pathScope stays
 *          separate from the DAST scanContext when both are present.
 * Author: Vigilnz
 * Date: 2026-08-12
 */

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { stubAction } = require("./helpers/action-stub");

// Stubbed before requiring index.js, which invokes runVigilnzScan() at module load:
// without the stub that call reports a missing API key through setFailed and would set a
// non-zero exit code for the whole test run. Deliberately never restored here.
const stub = stubAction();

const { buildScanRequest } = require("../src/index");

// The load-time run has no inputs and fails on the missing API key; that is expected and
// must not be mistaken for a test failure.
stub.failures.length = 0;
process.exitCode = 0;

/** Config as readInputs() would return it for an unscoped sca+secret run. */
function baseConfig(overrides = {}) {
  return {
    scanTypesInList: ["cve", "secret"],
    projectName: "Vigilnz_Backend",
    includePaths: "",
    excludePaths: "",
    dastScanType: "",
    dastTargetUrl: "",
    containerCtx: {},
    ...overrides,
  };
}

const REPO_URL = "https://github.com/Vigilnz/Vigilnz";

describe("buildScanRequest without path scope", () => {
  it("produces a body with no pathScope key", () => {
    const body = buildScanRequest(baseConfig(), REPO_URL, "main", null);

    assert.equal("pathScope" in body, false);
    assert.deepEqual(body, {
      scanTypes: ["cve", "secret"],
      gitRepoUrl: REPO_URL,
      projectName: "Vigilnz_Backend",
      branch: "main",
    });
  });

  it("still omits branch and ciContext when they are absent", () => {
    const body = buildScanRequest(baseConfig(), REPO_URL, "", null);

    assert.deepEqual(Object.keys(body).sort(), ["gitRepoUrl", "projectName", "scanTypes"]);
  });

  it("keeps ciContext alongside branch", () => {
    const ciContext = { provider: "github-actions", runId: "42" };
    const body = buildScanRequest(baseConfig(), REPO_URL, "main", ciContext);

    assert.deepEqual(body.ciContext, ciContext);
    assert.equal("pathScope" in body, false);
  });
});

describe("buildScanRequest with path scope", () => {
  it("adds pathScope as a top-level field", () => {
    const config = baseConfig({ includePaths: "backend/", excludePaths: "backend/API/tests/" });
    const body = buildScanRequest(config, REPO_URL, "main", null);

    assert.deepEqual(body.pathScope, {
      includedPaths: ["backend"],
      excludedPaths: ["backend/API/tests"],
    });
  });

  it("returns null when the scope fails validation, before any request is built", () => {
    const config = baseConfig({ includePaths: "../etc" });

    assert.equal(buildScanRequest(config, REPO_URL, "main", null), null);
  });

  // A dast+cve run must keep the DAST payload in scanContext and the scope in pathScope;
  // folding scope into scanContext would have made these two collide.
  it("keeps pathScope separate from the DAST scanContext", () => {
    const config = baseConfig({
      scanTypesInList: ["dast", "cve"],
      includePaths: "backend/",
      dastScanType: "active",
      dastTargetUrl: "https://target.test",
    });
    const body = buildScanRequest(config, REPO_URL, "main", null);

    assert.deepEqual(body.scanContext, {
      dastScanType: "active",
      targetUrl: "https://target.test",
    });
    assert.deepEqual(body.pathScope, { includedPaths: ["backend"] });
  });
});
