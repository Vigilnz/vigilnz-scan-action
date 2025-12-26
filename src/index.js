const action = require("@actions/core")

const DEFAULT_URL = "https://api.vigilnz.com"
const ACCESS_TOKEN_URL = DEFAULT_URL + "/auth/api-key"
const SCAN_URL = DEFAULT_URL + "/scan-targets/multi-scan"


async function runVigilnzScan() {

    try {
        console.log("Scan Started")
        const apiKey = action.getInput("vigilnzApiKey")
        const scanTypes = action.getInput("scanTypes")

        const repo = process.env.GITHUB_REPOSITORY; // e.g. SomeUser/their-project
        const serverUrl = process.env.GITHUB_SERVER_URL; // e.g. https://github.com 
        const repoUrl = `${serverUrl}/${repo}`;

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
                if (type === "sca") {
                    return "cve"
                } else {
                    return type?.trim()
                }
            });
        }

        // action.info(`The Info message token : ${apiKey}`)
        action.info(`Github Repo url : ${repoUrl}`)
        action.info(`Scan types : ${scanTypesInList}`)

        await runScan(apiKey, scanTypesInList, repoUrl)

    } catch (err) {
        console.log("Error: ", err)
        action.setFailed(`Scan failed: ${err.message}`);
    }
}

async function runScan(apiKey, scanTypesInList, repoUrl) {
    const tokenResponse = await apiAuthenticate(apiKey);

    if (tokenResponse?.status !== 200 || !tokenResponse.access_token) {
        console.log("Error: ", tokenResponse)
        action.setFailed(`Scan failed: No valid access token received from Vigilnz API`);
        return
    }

    const scanApiRequest = {
        scanTypes: scanTypesInList,
        gitRepoUrl: repoUrl
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

async function apiAuthenticate(apiKey) {
    try {

        const response = await fetch(ACCESS_TOKEN_URL,
            {
                method: "POST",
                headers: { ['Content-Type']: "application/json" },
                body: JSON.stringify({ apiKey })
            })

        const data = await response.json(); // parse JSON response
        console.log("Access Token Response status:", response.status);

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