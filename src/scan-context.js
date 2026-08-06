/**
 * scan-context.js
 * Purpose: Build the DAST and container scan-context payloads from action inputs,
 *          validating the per-registry credential requirements before dispatch.
 * Author: Vigilnz
 * Date: 2026-08-06
 */

"use strict";

const action = require("@actions/core");

const AUTH_TYPE = Object.freeze({
  NONE: "none",
  TOKEN: "token",
  USERNAME_PASSWORD: "username-password",
});

const REGISTRY_SUBTYPE = Object.freeze({
  ECR_PRIVATE: "ecr-private",
  ARTIFACT_REGISTRY: "artifact-registry",
  ACR_PRIVATE: "acr-private",
});

/**
 * Build the DAST scan context.
 *
 * @param {string} dastScanType
 * @param {string} dastTargetUrl
 * @returns {{dastScanType: string, targetUrl: string}|false}
 */
function buildDastContext(dastScanType, dastTargetUrl) {
  if (!dastScanType || !dastTargetUrl) {
    action.setFailed("DAST scan requires both 'dastScanType' and 'dastTargetUrl'");
    return false;
  }
  return { dastScanType, targetUrl: dastTargetUrl };
}

/**
 * Seed the container payload with the provider-independent fields.
 *
 * @param {Record<string, string>} ctx
 * @returns {object}
 */
function buildBaseContainerInfo(ctx) {
  return {
    imageName: ctx.containerImage,
    registryProvider: ctx.containerProvider,
    registrySubType: null,
    authMethod: ctx.containerAuthType || AUTH_TYPE.NONE,
    credentials: null,
    customRegistryUrl: "",
  };
}

/**
 * Attach token credentials, failing the run when token auth was selected without a token.
 *
 * @param {object} info - Mutated in place
 * @param {Record<string, string>} ctx
 * @param {string} label - Provider label used in the failure message
 * @returns {boolean} False when validation failed
 */
function applyTokenCredentials(info, ctx, label) {
  if (ctx.containerAuthType === AUTH_TYPE.TOKEN && !ctx.containerToken) {
    action.setFailed(`${label} requires 'containerToken'`);
    return false;
  }
  info.credentials = { token: ctx.containerToken };
  return true;
}

/**
 * Attach username/password credentials when that auth type was selected.
 *
 * @param {object} info - Mutated in place
 * @param {Record<string, string>} ctx
 * @param {string} label - Provider label used in the failure message
 * @returns {boolean} False when validation failed
 */
function applyUsernamePasswordCredentials(info, ctx, label) {
  if (ctx.containerAuthType !== AUTH_TYPE.USERNAME_PASSWORD) return true;

  if (!ctx.containerUsername || !ctx.containerPassword) {
    action.setFailed(`${label} requires both 'containerUsername' and 'containerPassword'`);
    return false;
  }
  info.credentials = { username: ctx.containerUsername, password: ctx.containerPassword };
  return true;
}

/**
 * Require a registry sub-type and record it on the payload.
 *
 * @param {object} info - Mutated in place
 * @param {Record<string, string>} ctx
 * @param {string} message - Failure message when the sub-type is missing
 * @returns {boolean} False when validation failed
 */
function applyRegistrySubType(info, ctx, message) {
  if (!ctx.containerRegistryType) {
    action.setFailed(message);
    return false;
  }
  info.registrySubType = ctx.containerRegistryType;
  return true;
}

function buildDockerHubContext(info, ctx) {
  return applyUsernamePasswordCredentials(info, ctx, "DockerHub private") ? info : null;
}

function buildAwsEcrContext(info, ctx) {
  const subTypeMessage = "AWS ECR requires 'containerRegistryType' (ecr-public or ecr-private)";
  if (!applyRegistrySubType(info, ctx, subTypeMessage)) return null;

  if (ctx.containerRegistryType !== REGISTRY_SUBTYPE.ECR_PRIVATE) return info;

  if (!ctx.containerRegistryUrl) {
    action.setFailed("AWS ECR private requires 'containerRegistryUrl'");
    return null;
  }
  info.customRegistryUrl = ctx.containerRegistryUrl;

  return applyTokenCredentials(info, ctx, "AWS ECR private with token") ? info : null;
}

function buildGitRegistryContext(info, ctx) {
  return applyTokenCredentials(info, ctx, `${ctx.containerProvider} private`) ? info : null;
}

function buildGoogleContext(info, ctx) {
  const subTypeMessage = "Google requires 'containerRegistryType' (gcr or artifact-registry)";
  if (!applyRegistrySubType(info, ctx, subTypeMessage)) return null;

  if (ctx.containerRegistryType === REGISTRY_SUBTYPE.ARTIFACT_REGISTRY && !ctx.containerRegistryUrl) {
    action.setFailed("Google Artifact Registry requires 'containerRegistryUrl'");
    return null;
  }
  info.customRegistryUrl = ctx.containerRegistryUrl;

  return applyTokenCredentials(info, ctx, "Google private") ? info : null;
}

function buildAzureContext(info, ctx) {
  const subTypeMessage = "Azure requires 'containerRegistryType' (mcr or acr-private)";
  if (!applyRegistrySubType(info, ctx, subTypeMessage)) return null;

  if (ctx.containerRegistryType !== REGISTRY_SUBTYPE.ACR_PRIVATE) return info;

  if (!ctx.containerRegistryUrl) {
    action.setFailed("Azure ACR private requires 'containerRegistryUrl'");
    return null;
  }
  info.customRegistryUrl = ctx.containerRegistryUrl;

  if (!applyTokenCredentials(info, ctx, "Azure ACR private with token")) return null;
  return applyUsernamePasswordCredentials(info, ctx, "Azure ACR private with username-password")
    ? info
    : null;
}

function buildQuayContext(info, ctx) {
  if (!applyTokenCredentials(info, ctx, "Quay private with token")) return null;
  return applyUsernamePasswordCredentials(info, ctx, "Quay private with username-password")
    ? info
    : null;
}

const CONTAINER_PROVIDER_BUILDERS = Object.freeze({
  dockerhub: buildDockerHubContext,
  "aws-ecr": buildAwsEcrContext,
  github: buildGitRegistryContext,
  gitlab: buildGitRegistryContext,
  google: buildGoogleContext,
  azure: buildAzureContext,
  quay: buildQuayContext,
});

/**
 * Build the container scan context for the configured registry provider.
 *
 * @param {Record<string, string>} ctx - Container inputs
 * @returns {object|false|null} Payload, false on missing required inputs, null on
 *                              credential/registry validation failure
 */
function buildContainerContext(ctx) {
  if (!ctx.containerImage || !ctx.containerProvider) {
    action.setFailed("Container scan requires both 'containerImage' and 'containerProvider'");
    return false;
  }

  const builder = CONTAINER_PROVIDER_BUILDERS[ctx.containerProvider.toLowerCase()];
  if (!builder) {
    action.setFailed(`Unsupported containerProvider: ${ctx.containerProvider}`);
    return null;
  }

  return builder(buildBaseContainerInfo(ctx), ctx);
}

module.exports = { buildDastContext, buildContainerContext, AUTH_TYPE, REGISTRY_SUBTYPE };
