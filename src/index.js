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

        let scanTypesInList = []
        if (scanTypes?.trim() !== "") {
            scanTypesInList = scanTypes?.split(",")?.flatMap((type) => {
                if (type?.toLowerCase() === "sca") {
                    return "cve"
                } else if (type?.toLowerCase() === "secret scan") {
                    return "secret"
                } else if (type?.toLowerCase() === "iac scan") {
                    return "iac"
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