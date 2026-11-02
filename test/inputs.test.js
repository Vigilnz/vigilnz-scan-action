"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  getBaseUrl,
} = require("../src/inputs");
const {
  DEV_DEFAULT_URL,
  DEMO_DEFAULT_URL,
  PROD_DEFAULT_URL,
} = require("../src/constants");

describe("public middleware URL selection", () => {
  it("selects the existing public middleware origins by environment", () => {
    assert.equal(getBaseUrl("dev"), DEV_DEFAULT_URL);
    assert.equal(getBaseUrl("production"), PROD_DEFAULT_URL);
  });

  it("falls back to production for an empty or unrecognised environment", () => {
    assert.equal(getBaseUrl(""), PROD_DEFAULT_URL);
    assert.equal(getBaseUrl(undefined), PROD_DEFAULT_URL);
    assert.equal(getBaseUrl("staging"), PROD_DEFAULT_URL);
  });

  // No user-configurable override exists — every run talks to one of the
  // three fixed, first-party origins above. getBaseUrl takes only `env`.
  it("selects the demo origin when one is configured", () => {
    assert.equal(getBaseUrl("demo"), DEMO_DEFAULT_URL);
  });
});
