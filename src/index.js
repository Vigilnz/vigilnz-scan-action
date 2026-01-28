const action = require("@actions/core")

const DEV_DEFAULT_URL = "https://devapi.vigilnz.com"
const DEMO_DEFAULT_URL = "https://demoapi.vigilnz.com"
const PROD_DEFAULT_URL = "https://api.vigilnz.com"

function getBaseUrl(env) {
    switch (env?.toLowerCase()) {
        case "dev":
        case "development":
            return DEV_DEFAULT_URL;
        case "prod":
        case "production":
            return PROD_DEFAULT_URL;
        case "demo":
            return DEMO_DEFAULT_URL;
        default:
            return DEV_DEFAULT_URL;
    }
}


async function runVigilnzScan() {

    try {
        console.log("Scan Started")
        const apiKey = action.getInput("vigilnzApiKey")
        const scanTypes = action.getInput("scanTypes")
        const projectName = action.getInput("projectName")
        const environment = action.getInput("environment")

        // dast scan fields
        const dastScanType = action.getInput("dastScanType")
        const dastTargetUrl = action.getInput("dastTargetUrl")

        // container scan fields  
        const containerCtx = {
            containerImage: core.getInput('containerImage'),
            containerProvider: core.getInput('containerProvider'),
            containerRegistryType: core.getInput('containerRegistryType'),
            containerRegistryUrl: core.getInput('containerRegistryUrl'),
            containerAuthType: core.getInput('containerAuthType'),
            containerToken: core.getInput('containerToken'),
            containerUsername: core.getInput('containerUsername'),
            containerPassword: core.getInput('containerPassword')
        };

        const repo = process.env.GITHUB_REPOSITORY; // e.g. SomeUser/their-project
        const serverUrl = process.env.GITHUB_SERVER_URL; // e.g. https://github.com 
        const repoUrl = `${serverUrl}/${repo}`;

        const BASE_URL = getBaseUrl(environment);
        const ACCESS_TOKEN_URL = BASE_URL + "/auth/api-key";
        const SCAN_URL = BASE_URL + "/scan-targets/multi-scan";


        if (!apiKey) {
            action.setFailed(`Vigilnz API Key is Required`);
            return
        }

        if (!scanTypes) {
            action.setFailed(`Scan Types not mentioned`);
            return
        }

        if (scanTypes?.split(",").some(s => s.toLocaleLowerCase() === "dast")) {
            if (!dastScanType || !dastTargetUrl) {
                action.setFailed(`DAST scan requires both 'dastTargetUrl' and 'dastScanType'`);
                return
            }
        }

        if (scanTypes?.split(",").some(s => s.toLocaleLowerCase() === "container scan" || s.toLocaleLowerCase() === "container")) {
            if (!containerImage || !containerProvider) {
                action.setFailed(`Container scan requires both 'containerImage' and 'containerProvider'`);
                return
            }
        }

        if (!scanTypes) {
            action.setFailed(`Scan Types not mentioned`);
            return
        }

        let scanTypesInList = []
        if (scanTypes?.trim() !== "") {
            scanTypesInList = scanTypes?.split(",")?.flatMap((type) => {
                if (type?.toLowerCase() === "sca") {
                    return "cve"
                } else if (type?.toLowerCase() === "secret scan") {
                    return "secret"
                } else if (type?.toLowerCase() === "iac scan") {
                    return "iac"
                } else if (type?.toLowerCase() === "container scan") {
                    return "container"
                } else {
                    return type?.trim()?.toLowerCase()
                }
            });
        }

        // action.info(`The Info message token : ${apiKey}`)
        action.info(`Github Repo url : ${repoUrl}`)
        action.info(`Scan types : ${scanTypesInList}`)

        const scanApiRequest = {
            scanTypes: scanTypesInList,
            gitRepoUrl: repoUrl,
            projectName: projectName || "",
        }

        if (scanTypesInList.includes("dast")) {
            scanApiRequest.scanContext = validateInputs("dast", dastScanType, dastTargetUrl, containerCtx)
        }

        if (scanTypesInList.includes("container")) {
            scanApiRequest.containerScanContext = validateInputs("container", dastScanType, dastTargetUrl, containerCtx)
        }

        await runScan(apiKey, scanApiRequest, ACCESS_TOKEN_URL, SCAN_URL)

    } catch (err) {
        console.log("Error: ", err)
        action.setFailed(`Scan failed: ${err.message}`);
    }
}

async function runScan(apiKey, scanApiRequest, ACCESS_TOKEN_URL, SCAN_URL) {
    const tokenResponse = await apiAuthenticate(apiKey, ACCESS_TOKEN_URL);

    if (tokenResponse?.status !== 200 || !tokenResponse.access_token) {
        console.log("Error: ", tokenResponse)
        action.setFailed(`Scan failed: No valid access token received from Vigilnz API`);
        return
    }

    try {
        const response = await fetch(SCAN_URL, {
            method: "POST",
            headers: {
                ['Content-Type']: "application/json",
                "Authorization": `Bearer ${tokenResponse?.access_token}`
            },
            body: JSON.stringify(scanApiRequest)
        })
        const data = await response.json(); // parse JSON response

        if (!response.ok) {
            action.setFailed(`Scan failed (${response.status}): ${data.message || response.statusText}`);
            return
        }
        console.log("Scan API Response :", data);
        console.log("Scan Completed Successfully");
        // console.log("Scan API Response status:", response.status);
        // console.log("Scan API Response :", data);
    } catch (error) {
        action.setFailed(`Scan failed`);
        console.log("Error in Scan API:", error)
        return
    }
}

async function apiAuthenticate(apiKey, ACCESS_TOKEN_URL) {
    try {

        const response = await fetch(ACCESS_TOKEN_URL,
            {
                method: "POST",
                headers: { ['Content-Type']: "application/json" },
                body: JSON.stringify({ apiKey })
            })

        const data = await response.json(); // parse JSON response
        console.log("Access Token Response status : ", response.status);

        if (!response.ok) {
            action.setFailed(`Scan failed`);
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        console.log("Access Token Fetched Successfully");
        return { ...data, status: response?.status };
    } catch (error) {
        action.setFailed(`Scan failed`);
        console.error("Error in apiAuthenticate:", error);
        return null;
    }
}

runVigilnzScan()

function validateInputs(scanTypes, dastScanType, dastTargetUrl, containerCtx) {

    // --- DAST validation ---
    if (scanTypes === "dast") {
        if (!dastScanType || !dastTargetUrl) {
            core.setFailed(`DAST scan requires both 'dastScanType' and 'dastTargetUrl'`);
            return false;
        } else {
            return {
                dastScanType: dastScanType,
                targetUrl: dastTargetUrl
            }
        }
    }

    // --- Container validation ---
    if (scanTypes === "container" || scanTypes === "container scan") {

        const {
            containerImage,
            containerProvider,
            containerRegistryType,
            containerRegistryUrl,
            containerAuthType,
            containerToken,
            containerUsername,
            containerPassword
        } = containerCtx;

        if (!containerImage || !containerProvider) {
            core.setFailed(`Container scan requires both 'containerImage' and 'containerProvider'`);
            return false;
        }

        let containerInfo = {
            imageName: containerImage,
            registryProvider: containerProvider,
            registrySubType: null,
            authMethod: containerAuthType || "none",
            credentials: null,
            customRegistryUrl: "",
        }

        switch (containerProvider.toLowerCase()) {
            case "dockerhub":
                if (containerAuthType === "username-password") {
                    if (!containerUsername || !containerPassword) {
                        core.setFailed(`DockerHub private requires 'containerUsername' and 'containerPassword'`);
                        return null;
                    } else {
                        containerInfo.credentials = {
                            username: containerUsername,
                            password: containerPassword
                        }
                    }
                }
                return containerInfo;

            case "aws-ecr":
                if (!containerRegistryType) {
                    core.setFailed(`AWS ECR requires 'containerRegistryType' (ecr-public or ecr-private)`);
                    return null;
                } else {
                    containerInfo.registrySubType = containerRegistryType;
                }

                if (containerRegistryType === "ecr-private") {
                    if (!containerRegistryUrl) {
                        core.setFailed(`AWS ECR private requires 'containerRegistryUrl'`);
                        return null;
                    } else {
                        containerInfo.customRegistryUrl = containerRegistryUrl;
                    }
                    if (containerAuthType === "token" && !containerToken) {
                        core.setFailed(`AWS ECR private with token requires 'containerToken'`);
                        return null;
                    } else {
                        containerInfo.credentials = {
                            token: containerToken
                        }
                    }
                }
                return containerInfo;

            case "github":
            case "gitlab":
                if (containerAuthType === "token" && !containerToken) {
                    core.setFailed(`${containerProvider} private requires 'containerToken'`);
                    return null;
                } else {
                    containerInfo.credentials = {
                        token: containerToken
                    }
                }
                return containerInfo;

            case "google":
                if (!containerRegistryType) {
                    core.setFailed(`Google requires 'containerRegistryType' (gcr or artifact-registry)`);
                    return null;
                } else {
                    containerInfo.registrySubType = containerRegistryType
                }
                if (containerRegistryType === "artifact-registry" && !containerRegistryUrl) {
                    core.setFailed(`Google Artifact Registry requires 'containerRegistryUrl'`);
                    return null;
                } else {
                    containerInfo.customRegistryUrl = containerRegistryUrl
                }
                if (containerAuthType === "token" && !containerToken) {
                    core.setFailed(`Google private requires 'containerToken'`);
                    return null;
                } else {
                    containerInfo.credentials = {
                        token: containerToken
                    }
                }
                return containerInfo;

            case "azure":
                if (!containerRegistryType) {
                    core.setFailed(`Azure requires 'containerRegistryType' (mcr or acr-private)`);
                    return null;
                } else {
                    containerInfo.registrySubType = containerRegistryType
                }
                if (containerRegistryType === "acr-private") {
                    if (!containerRegistryUrl) {
                        core.setFailed(`Azure ACR private requires 'containerRegistryUrl'`);
                        return null;
                    } else {
                        containerInfo.customRegistryUrl = containerRegistryUrl
                    }
                    if (containerAuthType === "token" && !containerToken) {
                        core.setFailed(`Azure ACR private with token requires 'containerToken'`);
                        return null;
                    } else {
                        containerInfo.credentials = {
                            token: containerToken
                        }
                    }
                    if (containerAuthType === "username-password") {
                        if (!containerUsername || !containerPassword) {
                            core.setFailed(`Azure ACR private with username-password requires both 'containerUsername' and 'containerPassword'`);
                            return null;
                        } else {
                            containerInfo.credentials = {
                                username: containerUsername,
                                password: containerPassword
                            }
                        }
                    }
                }
                return containerInfo;

            case "quay":
                if (containerAuthType === "token" && !containerToken) {
                    core.setFailed(`Quay private with token requires 'containerToken'`);
                    return null;
                } else {
                    containerInfo.credentials = {
                        token: containerToken
                    }
                }
                if (containerAuthType === "username-password") {
                    if (!containerUsername || !containerPassword) {
                        core.setFailed(`Quay private with username-password requires both 'containerUsername' and 'containerPassword'`);
                        return null;
                    } else {
                        containerInfo.credentials = {
                            username: containerUsername,
                            password: containerPassword
                        }
                    }
                }
                return containerInfo;

            default:
                core.setFailed(`Unsupported containerProvider: ${containerProvider}`);
                return null;
        }
    }

    return true;
}
