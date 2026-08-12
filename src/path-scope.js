/**
 * path-scope.js
 * Purpose: Build the monorepo path-scope payload from the includePaths / excludePaths
 *          inputs, so a scan of a monorepo can be limited to one service folder instead
 *          of the whole repository. Rejects paths that are not safely repo-relative
 *          before any request is issued.
 * Author: Vigilnz
 * Date: 2026-08-12
 */

"use strict";

const action = require("@actions/core");

const {
  PATH_SCOPE_SEPARATOR,
  MAX_PATH_SCOPE_ENTRIES,
  MAX_PATH_LENGTH,
  REPO_FILE_SCAN_TYPES,
} = require("./constants");

/** Matches a Windows drive-letter prefix (e.g. `C:\`), which is an absolute path. */
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:/;

/**
 * Report whether a path is safely repo-root-relative.
 *
 * Rejected: absolute POSIX (`/x`) and Windows (`C:\x`) paths, UNC-style (`\\host`) paths,
 * `~` home references, over-length values, and anything containing a `..` segment.
 *
 * @param {string} value - Already trimmed
 * @returns {boolean}
 */
function isSafeRelativePath(value) {
  if (!value || value.length > MAX_PATH_LENGTH) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (WINDOWS_ABSOLUTE_PATH_PATTERN.test(value)) return false;
  if (value.startsWith("~")) return false;

  // Segment-wise so `..foo` (a legitimate directory name) is allowed while any real
  // parent-directory hop is not, on either separator.
  return !value.split(/[/\\]+/).includes("..");
}

/**
 * Split, validate and normalize one comma-separated path input.
 *
 * @param {string} raw - Input value, e.g. "backend/, shared"
 * @param {string} inputName - Input name, used in the failure message
 * @returns {string[]|false} Normalized prefixes, or false when an entry was rejected
 */
function normalizePathList(raw, inputName) {
  const entries = String(raw || "")
    .split(PATH_SCOPE_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean);

  const normalized = new Set();
  for (const entry of entries) {
    if (!isSafeRelativePath(entry)) {
      action.setFailed(
        `Invalid '${inputName}' entry: "${entry}". Paths must be relative to the repository ` +
          `root, must not be absolute and must not contain '..'.`
      );
      return false;
    }

    const prefix = entry.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/, "");
    if (prefix) normalized.add(prefix);
  }

  if (normalized.size > MAX_PATH_SCOPE_ENTRIES) {
    action.setFailed(
      `Too many '${inputName}' entries (${normalized.size}); the maximum is ${MAX_PATH_SCOPE_ENTRIES}.`
    );
    return false;
  }

  return [...normalized];
}

/**
 * Report whether any requested scan type reads repository files.
 *
 * @param {string[]} scanTypesInList
 * @returns {boolean}
 */
function hasRepoFileScanType(scanTypesInList) {
  return scanTypesInList.some((scanType) => REPO_FILE_SCAN_TYPES.includes(scanType));
}

/**
 * Build the `pathScope` request field.
 *
 * @param {string} includePaths - Raw includePaths input
 * @param {string} excludePaths - Raw excludePaths input
 * @param {string[]} scanTypesInList - Normalized scan types for this run
 * @returns {{includedPaths?: string[], excludedPaths?: string[]}|null|false}
 *          Payload to send, null when there is nothing to scope, or false when an input
 *          failed validation (the run has already been failed)
 */
function buildPathScope(includePaths, excludePaths, scanTypesInList) {
  const included = normalizePathList(includePaths, "includePaths");
  if (included === false) return false;

  const excluded = normalizePathList(excludePaths, "excludePaths");
  if (excluded === false) return false;

  if (included.length === 0 && excluded.length === 0) {
    return null;
  }

  // dast targets a URL and container targets an image, so neither reads repository
  // files. Scoping such a run is a no-op worth telling the user about.
  if (!hasRepoFileScanType(scanTypesInList)) {
    action.warning(
      "'includePaths' / 'excludePaths' were ignored: none of the requested scan types " +
        "read repository files."
    );
    return null;
  }

  return {
    ...(included.length > 0 ? { includedPaths: included } : {}),
    ...(excluded.length > 0 ? { excludedPaths: excluded } : {}),
  };
}

module.exports = { isSafeRelativePath, normalizePathList, hasRepoFileScanType, buildPathScope };
