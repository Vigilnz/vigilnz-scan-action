/**
 * path-scope.test.js
 * Purpose: Tests for the includePaths / excludePaths inputs — normalization, the
 *          traversal / absolute-path rejection that must stop a run before it issues a
 *          request, and the no-op warning for scan types that read no repository files.
 * Author: Vigilnz
 * Date: 2026-08-12
 */

"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { stubAction } = require("./helpers/action-stub");
const { MAX_PATH_SCOPE_ENTRIES, MAX_PATH_LENGTH } = require("../src/constants");
const {
  isSafeRelativePath,
  normalizePathList,
  hasRepoFileScanType,
  buildPathScope,
} = require("../src/path-scope");

let stub;

beforeEach(() => {
  stub = stubAction();
});

afterEach(() => {
  stub.restore();
});

describe("isSafeRelativePath", () => {
  it("accepts repo-relative paths", () => {
    for (const value of ["backend", "backend/API", "shared/otel", ".github/workflows", "..foo"]) {
      assert.equal(isSafeRelativePath(value), true, value);
    }
  });

  it("rejects traversal", () => {
    for (const value of ["..", "../etc", "backend/../../etc", "backend/..", "backend\\..\\x"]) {
      assert.equal(isSafeRelativePath(value), false, value);
    }
  });

  it("rejects absolute and home-relative paths", () => {
    for (const value of ["/etc", "\\etc", "C:\\Windows", "c:/windows", "\\\\host\\share", "~/x"]) {
      assert.equal(isSafeRelativePath(value), false, value);
    }
  });

  it("rejects empty and over-length values", () => {
    assert.equal(isSafeRelativePath(""), false);
    assert.equal(isSafeRelativePath("a".repeat(MAX_PATH_LENGTH + 1)), false);
  });
});

describe("normalizePathList", () => {
  it("splits, trims and strips trailing slashes", () => {
    assert.deepEqual(normalizePathList("backend/, shared/ ", "includePaths"), [
      "backend",
      "shared",
    ]);
  });

  it("normalizes separators", () => {
    assert.deepEqual(normalizePathList("backend\\API", "includePaths"), ["backend/API"]);
    assert.deepEqual(normalizePathList("backend//API//", "includePaths"), ["backend/API"]);
  });

  it("dedupes entries that normalize to the same prefix", () => {
    assert.deepEqual(normalizePathList("backend,backend/,backend\\", "includePaths"), ["backend"]);
  });

  it("returns an empty list for empty input", () => {
    for (const raw of ["", "   ", ",,,", undefined, null]) {
      assert.deepEqual(normalizePathList(raw, "includePaths"), [], String(raw));
      assert.equal(stub.failures.length, 0);
    }
  });

  it("fails the run on a traversal entry", () => {
    assert.equal(normalizePathList("backend,../etc", "includePaths"), false);
    assert.equal(stub.failures.length, 1);
    assert.match(stub.failures[0], /includePaths/);
    assert.match(stub.failures[0], /\.\./);
  });

  it("fails the run on an absolute entry", () => {
    assert.equal(normalizePathList("/etc/passwd", "excludePaths"), false);
    assert.equal(stub.failures.length, 1);
    assert.match(stub.failures[0], /excludePaths/);
  });

  it("fails the run when there are too many entries", () => {
    const many = Array.from({ length: MAX_PATH_SCOPE_ENTRIES + 1 }, (_, i) => `dir${i}`).join(",");
    assert.equal(normalizePathList(many, "includePaths"), false);
    assert.match(stub.failures[0], /Too many/);
  });

  it("accepts exactly the maximum number of entries", () => {
    const max = Array.from({ length: MAX_PATH_SCOPE_ENTRIES }, (_, i) => `dir${i}`).join(",");
    assert.equal(normalizePathList(max, "includePaths").length, MAX_PATH_SCOPE_ENTRIES);
    assert.equal(stub.failures.length, 0);
  });
});

describe("hasRepoFileScanType", () => {
  it("recognizes repository-file scan types", () => {
    assert.equal(hasRepoFileScanType(["cve"]), true);
    assert.equal(hasRepoFileScanType(["secret"]), true);
    assert.equal(hasRepoFileScanType(["dast", "cve"]), true);
  });

  it("rejects runs that read no repository files", () => {
    assert.equal(hasRepoFileScanType(["dast"]), false);
    assert.equal(hasRepoFileScanType(["container"]), false);
    assert.equal(hasRepoFileScanType([]), false);
  });
});

describe("buildPathScope", () => {
  const repoScan = ["cve", "secret"];

  it("builds both lists", () => {
    const scope = buildPathScope("backend/", "backend/API/tests/", repoScan);

    assert.deepEqual(scope, {
      includedPaths: ["backend"],
      excludedPaths: ["backend/API/tests"],
    });
  });

  it("builds an include-only scope", () => {
    assert.deepEqual(buildPathScope("backend/", "", repoScan), { includedPaths: ["backend"] });
  });

  it("builds an exclude-only scope", () => {
    assert.deepEqual(buildPathScope("", "docs/", repoScan), { excludedPaths: ["docs"] });
  });

  // The no-regression case: without these inputs the request body must be unchanged.
  it("returns null when neither input is set", () => {
    assert.equal(buildPathScope("", "", repoScan), null);
    assert.equal(buildPathScope(undefined, undefined, repoScan), null);
    assert.equal(stub.failures.length, 0);
    assert.equal(stub.warnings.length, 0);
  });

  it("returns false when an input fails validation", () => {
    assert.equal(buildPathScope("../etc", "", repoScan), false);
    assert.equal(stub.failures.length, 1);
  });

  it("validates excludePaths as well as includePaths", () => {
    assert.equal(buildPathScope("backend", "/etc", repoScan), false);
    assert.equal(stub.failures.length, 1);
  });

  it("warns and omits the scope when no scan type reads repository files", () => {
    assert.equal(buildPathScope("backend/", "", ["dast"]), null);
    assert.equal(stub.warnings.length, 1);
    assert.match(stub.warnings[0], /ignored/);
    assert.equal(stub.failures.length, 0);
  });

  it("still scopes a mixed run that includes a repository-file scan type", () => {
    const scope = buildPathScope("backend/", "", ["dast", "cve"]);

    assert.deepEqual(scope, { includedPaths: ["backend"] });
    assert.equal(stub.warnings.length, 0);
  });
});
