# <img src="images/vigilnz.svg" width="40" height="40" align="absmiddle" /> Vigilnz GitHub Action

## Overview
The **Vigilnz Security Scan Action** checks your applications and repositories for vulnerabilities during CI/CD.

It supports multiple scan types:
- **SCA** → Software Composition Analysis
- **SBOM** → Software Bill of Materials generation
- **SAST** → Static Application Security Testing
- **IAC SCAN** → Infrastructure as Code — checks configuration files (Terraform, Kubernetes, etc.) for misconfigurations.
- **SECRET SCAN** → Secret Detection — finds hardcoded credentials, API keys, and sensitive information in source code.
- **DAST** → Dynamic Application Security Testing — tests running web applications for security vulnerabilities.
- **CONTAINER SCAN** → Container Image Scanning — analyzes container images for vulnerabilities and misconfigurations.


This action makes it easy to integrate Vigilnz scanning into your GitHub workflows.

---

## Usage

1. [Generate an API key](#api-key-generation).
2. [Store it in GitHub Secrets](#store-the-api-key-securely-in-github-secrets).
3. [Add the action to your workflow](#add-the-action-to-your-github-workflow).

## API Key Generation

1. Log in to <a href="https://vigilnz.com/" target="_blank">Vigilnz</a>.
2. Go to **Settings → API Keys**.
3. Click **Generate New Key** (or **View API Key** if one exists).
4. Copy it and store it securely.

![API Key generation screen](images/vigilnz_api.png)

This key authenticates the action as your Vigilnz account. Treat it like any other
credential — store it in GitHub Secrets, never hardcode it in the workflow.

## Store the API key securely in GitHub Secrets

1. Repository **Settings → Secrets and variables → Actions**.
2. **New repository secret**.
3. Name: `VIGILNZ_API_KEY`, Value: your API key.

![Github Secrets](images/github_secret.png)

## Add the action to your GitHub workflow:

```yaml
name: Security Scan

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Vigilnz Scan
        uses: vigilnz/vigilnz-scan-action@v1
        with:
          vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
          scanTypes: "sca,sbom,sast,secret,iac"
          projectName: "my-project"
```

## Inputs

### Core inputs

`vigilnzApiKey` and `scanTypes` are required on every run.

| Name          | Accepted values / purpose |
|---------------|----------------------------|
| vigilnzApiKey | Your Vigilnz API key. Read from a GitHub secret. |
| scanTypes     | Comma-separated, case-insensitive: `sca`, `sbom`, `sast`, `secret`, `iac`, `dast`, `container`. Example: `"sca,sast,secret"`. |
| projectName   | Optional label shown for this run in the Vigilnz UI. |
| repoAccessToken | Optional fallback token for scanning a **private** repo — see [Scanning a private repository](#scanning-a-private-repository). |

The scanned **branch** needs no input — the action reads it from the workflow context
(`GITHUB_HEAD_REF` on `pull_request`, otherwise `GITHUB_REF_NAME`) and returns it in the
run's own [Outputs](#outputs).

### Scanning a private repository

**Recommended:** connect your GitHub account/org to Vigilnz once (an integration in your
Vigilnz account settings). Every private repo it covers then scans with no extra input —
nothing to add to the workflow.

**Fallback:** if no integration covers this repo, pass `repoAccessToken` instead:

```yaml
- uses: vigilnz/vigilnz-scan-action@v1
  with:
    vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
    scanTypes: "sca,sast,secret"
    repoAccessToken: ${{ secrets.GITHUB_TOKEN }}
```

Use the repo's own `${{ secrets.GITHUB_TOKEN }}` for same-repo scans, or a PAT with read
access for a different private repo. It's masked in logs and used only for this one scan
request — Vigilnz never stores it. A public repo, or one already covered by a connected
integration, needs neither.

### Monorepo Path Scoping

Both optional. By default the whole repository is scanned. In a monorepo, scope a pipeline
to just the service it builds — both take a comma-separated list of paths **relative to the
repository root**.

| Name         | Accepted values / purpose |
|--------------|----------------------------|
| includePaths | Only these paths are scanned. Empty (default) scans everything. |
| excludePaths | Skipped after `includePaths` is applied — an exclusion always wins. |

```yaml
- name: Scan only the backend service
  uses: vigilnz/vigilnz-scan-action@v1
  with:
    vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
    scanTypes: "sca,secret"
    includePaths: "backend/,shared/"
    excludePaths: "backend/API/tests/"
```

A path matches a file when it equals it or is a parent directory, on segment boundaries —
`backend` matches `backend/api.js`, never `backend-legacy/api.js`. Absolute paths or any `..`
are rejected (up to 32 entries per list, 512 characters each).

Only applies to scan types that read repository files (`sca`, `sbom`, `sast`, `iac`,
`secret`). `dast` (targets a URL) and `container` (targets an image) ignore these inputs.

> **SCA note:** a scoped directory must contain a dependency manifest or lock file, or it
> reports no dependencies.

### Wait & Gating Inputs

All optional. By default the action **queues** the scans and exits immediately — it does
not wait. Set `waitForCompletion: true` to block until every scan finishes and (optionally)
fail the build on severity.

| Name                | Accepted values / purpose |
|---------------------|----------------------------|
| waitForCompletion   | `true` or `false`. Default `false` (queue and exit immediately). Set `true` to block the job until every queued scan reaches a terminal state (`complete`, `error`, or `timed_out`). |
| timeoutMinutes      | 1–360, default `30`. Max minutes to wait. Needs `waitForCompletion`. |
| pollIntervalSeconds | 5–300, default `15`. Seconds between status polls. Needs `waitForCompletion`. |
| failOnSeverity      | `critical`/`high`/`medium`/`low`/`none`, default `none`. Fail when findings at or above this severity exist. Needs `waitForCompletion`. |
| failOnScanError     | `true`/`false`, default `true`. Fail when a scan errors or times out. Only applies when `waitForCompletion: true`. |

### Outputs

Always set, including in queue-only mode. Severity counts are `0` unless
`waitForCompletion: true` actually read the results back.

| Name           | Description |
|----------------|--------------|
| scanTargetIds  | Comma-separated scan target IDs created by this run |
| scanStatus     | `pending` (queue-only), `complete`, `error`, or `timed_out` |
| repoUrl        | Repository URL that was scanned |
| branch         | Branch these scans were triggered for; empty if unresolved |
| criticalCount  | Total critical findings across all scan types |
| highCount      | Total high findings across all scan types |
| mediumCount    | Total medium findings across all scan types |
| lowCount       | Total low findings across all scan types |
| totalFindings  | Total findings across all scan types |
| resultsJson    | JSON array, one object per scan type — same shape whether or not `waitForCompletion` was set (see below) |

#### `resultsJson` entry fields

| Field              | Description |
|--------------------|--------------|
| scanTargetId       | ID of this scan type's scan target. |
| scanType           | `cve` (SCA), `sbom`, `sast`, `secret`, `iac`, `dast`, or `container`. |
| branch             | Same as the top-level `branch` output, repeated so each entry is self-contained. |
| status             | `pending`, `complete`, `error`, or `timed_out`. |
| percent            | Progress 0–100. On `error`/`timed_out`, how far it got before giving up (not always `0`). Always `0` when queue-only. |
| message            | Status detail from the platform, or this action's own explanation on a polling failure. |
| scanId             | The completed scan's own ID, for fetching findings. `null` until `complete`. |
| summary            | `{ critical, high, medium, low, totalFindings }` for this scan type. |
| isSummaryAvailable | `true` once `summary` was actually read — a `false` means the `0`s above aren't trustworthy; don't read them as "no findings". |

```yaml
- name: Report
  if: always()
  run: |
    echo "Branch:   ${{ steps.vigilnz.outputs.branch }}"
    echo "Critical: ${{ steps.vigilnz.outputs.criticalCount }}"
    echo "Total:    ${{ steps.vigilnz.outputs.totalFindings }}"

- name: Save full per-scan results as a build artifact
  if: always()
  run: echo '${{ steps.vigilnz.outputs.resultsJson }}' > vigilnz-results.json

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: vigilnz-scan-results
    path: vigilnz-results.json
```

### DAST Scan Inputs

Required together, **only when `dast` is in `scanTypes`**.

| Name          | Accepted values / purpose |
|---------------|----------------------------|
| dastScanType  | `spider` (crawl/catalog only) or `active` (crawl + actively probe for vulnerabilities). |
| dastTargetUrl | URL of the running app to test, e.g. `https://staging.example.com`. Must be reachable from Vigilnz's scanning infrastructure — no secret needed for a public target; this action can't send auth headers to the target itself. |

#### Run a DAST scan

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "dast"
  dastScanType: "active"
  dastTargetUrl: "https://example.com"
  projectName: "web-application"
```

### Container Scan Inputs

Apply **only when `container` is in `scanTypes`**. `containerImage` + `containerProvider`
are always required together; the rest depend on the registry — see each one below.

| Name                  | Accepted values / purpose |
|-----------------------|----------------------------|
| containerImage        | Image reference, e.g. `nginx:latest` or `myorg/myapp:1.0.0`. |
| containerProvider     | `dockerhub` (Docker Hub), `aws-ecr` (Amazon ECR), `github` (**GHCR**), `gitlab` (**GitLab Container Registry**), `google` (GCR / Artifact Registry), `azure` (ACR), `quay` (Quay.io). |
| containerRegistryType | Sub-type, required only by multi-shape providers — see below. |
| containerRegistryUrl  | Registry host/URL, only for the private/self-hosted sub-types below. |
| containerAuthType     | `none`, `token`, or `username-password` — which ones a provider accepts is listed below. |
| containerToken        | Token for `containerAuthType: token`. Type/permission differs per provider, below. |
| containerUsername     | Username for `containerAuthType: username-password`. |
| containerPassword     | Password/token-as-password for `containerAuthType: username-password`. |

#### Docker Hub (`dockerhub`)

| Image visibility | containerAuthType | Credentials |
|---|---|---|
| Public | `none` | None |
| Private | `username-password` | `containerUsername` + `containerPassword` (use a Docker Hub access token, not your account password) |

```yaml
# Public image
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "container"
  containerImage: "nginx:latest"
  containerProvider: "dockerhub"
  containerAuthType: "none"
```

```yaml
# Private image
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "container"
  containerImage: "myorg/myapp:1.0.0"
  containerProvider: "dockerhub"
  containerAuthType: "username-password"
  containerUsername: ${{ secrets.DOCKERHUB_USERNAME }}
  containerPassword: ${{ secrets.DOCKERHUB_PASSWORD }}
```

#### Amazon ECR (`aws-ecr`)

`containerRegistryType`: `ecr-public` or `ecr-private`. `ecr-private` also needs
`containerRegistryUrl` (e.g. `123456789012.dkr.ecr.us-east-1.amazonaws.com`) and
`containerAuthType: token` with an ECR authorization token (e.g. from
`aws ecr get-login-password`) — the IAM principal needs `ecr:GetAuthorizationToken` and
pull permissions (`ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`).

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "container"
  containerImage: "myapp:latest"
  containerProvider: "aws-ecr"
  containerRegistryType: "ecr-private"
  containerRegistryUrl: "123456789012.dkr.ecr.us-east-1.amazonaws.com"
  containerAuthType: "token"
  containerToken: ${{ secrets.AWS_ECR_TOKEN }}
```

#### GitHub Container Registry — GHCR (`github`)

`containerAuthType: token` with a token carrying `read:packages` — either `GITHUB_TOKEN`
(workflow needs `permissions: packages: read`) or a PAT with `read:packages`.

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "container"
  containerImage: "ghcr.io/myorg/myapp:latest"
  containerProvider: "github"
  containerAuthType: "token"
  containerToken: ${{ secrets.GITHUB_TOKEN }}
```

#### GitLab Container Registry (`gitlab`)

`containerAuthType: token` with a GitLab token carrying `read_registry`.

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "container"
  containerImage: "registry.gitlab.com/myorg/myapp:latest"
  containerProvider: "gitlab"
  containerAuthType: "token"
  containerToken: ${{ secrets.GITLAB_REGISTRY_TOKEN }}
```

#### Google Container/Artifact Registry (`google`)

`containerRegistryType`: `gcr` (legacy) or `artifact-registry` (also needs
`containerRegistryUrl`). `containerAuthType: token` with a GCP access token for a service
account granted `roles/artifactregistry.reader` (Artifact Registry) or
`roles/storage.objectViewer` (legacy GCR).

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "container"
  containerImage: "gcr.io/myproject/myapp:latest"
  containerProvider: "google"
  containerRegistryType: "gcr"
  containerAuthType: "token"
  containerToken: ${{ secrets.GCP_TOKEN }}
```

#### Azure Container Registry — ACR (`azure`)

`containerRegistryType`: `mcr` (public) or `acr-private` (also needs
`containerRegistryUrl`, e.g. `myregistry.azurecr.io`). `acr-private` accepts
`containerAuthType: token` (ACR token, e.g. from `az acr login --expose-token`) or
`username-password` — both need the `AcrPull` role.

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "container"
  containerImage: "myapp:latest"
  containerProvider: "azure"
  containerRegistryType: "acr-private"
  containerRegistryUrl: "myregistry.azurecr.io"
  containerAuthType: "token"
  containerToken: ${{ secrets.AZURE_ACR_TOKEN }}
```

#### Quay.io (`quay`)

No unauthenticated option — every image needs a Robot Account, via `containerAuthType:
token` or `username-password`, with at least **read** permission on the repository.

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "container"
  containerImage: "quay.io/myorg/myapp:latest"
  containerProvider: "quay"
  containerAuthType: "token"
  containerToken: ${{ secrets.QUAY_ROBOT_TOKEN }}
```

## Example Scenarios

### Block the PR until scans finish, and fail on high/critical:

```yaml
- name: Vigilnz Security Scan
  id: vigilnz
  uses: vigilnz/vigilnz-scan-action@v1
  with:
    vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
    scanTypes: "sca,sast,secret"
    projectName: "my-application"
    waitForCompletion: true
    timeoutMinutes: 45
    failOnSeverity: high

- name: Report
  if: always()
  run: |
    echo "Branch:   ${{ steps.vigilnz.outputs.branch }}"
    echo "Critical: ${{ steps.vigilnz.outputs.criticalCount }}"
    echo "High:     ${{ steps.vigilnz.outputs.highCount }}"
    echo "Total:    ${{ steps.vigilnz.outputs.totalFindings }}"
```

### Wait for results but never fail the build (report-only):

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "sca,sast"
  waitForCompletion: true
  failOnSeverity: none
  failOnScanError: false
```

### Run a single scan:

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "sca"
```

### Run all code-based scans:

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "sca,sbom,sast,secret,iac"
  projectName: "my-application"
```

### Run multiple scan types together:

Every scan type in `scanTypes` runs **in parallel on the Vigilnz platform, not one after
another** — here, SCA, SAST, DAST and Container all start together. With
`waitForCompletion: true`, the action polls all of them concurrently too, so total wait time
is bounded by the slowest scan type, not the sum of all of them.

```yaml
with:
  vigilnzApiKey: ${{ secrets.VIGILNZ_API_KEY }}
  scanTypes: "sca,sast,dast,container"
  projectName: "full-stack-app"
  # DAST configuration
  dastScanType: "active"
  dastTargetUrl: "https://myapp.example.com"
  # Container configuration
  containerImage: "myapp:latest"
  containerProvider: "dockerhub"
  containerAuthType: "none"
```
