/**
 * action-stub.js
 * Purpose: Test helper that captures @actions/core calls instead of writing to the
 *          workflow log or failing the run. The action modules keep a reference to the
 *          module object (`const action = require("@actions/core")`) rather than
 *          destructuring, so replacing methods on the shared module is observed by them.
 * Author: Vigilnz
 * Date: 2026-08-12
 */

"use strict";

const action = require("@actions/core");

const originals = {
  setFailed: action.setFailed,
  warning: action.warning,
  info: action.info,
  setSecret: action.setSecret,
  setOutput: action.setOutput,
};

/**
 * Replace the logging / failure surface with collectors.
 *
 * @returns {{failures: string[], warnings: string[], infos: string[], restore: () => void}}
 */
function stubAction() {
  const failures = [];
  const warnings = [];
  const infos = [];

  action.setFailed = (message) => {
    failures.push(String(message));
  };
  action.warning = (message) => {
    warnings.push(String(message));
  };
  action.info = (message) => {
    infos.push(String(message));
  };
  action.setSecret = () => {};
  action.setOutput = () => {};

  return {
    failures,
    warnings,
    infos,
    restore() {
      Object.assign(action, originals);
    },
  };
}

module.exports = { stubAction };
