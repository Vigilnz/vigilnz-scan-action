const action = require("@actions/core")

function runScan() {

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
            scanTypesInList = scanTypes?.split(",")?.flatMap((type) => type.trim());
        }

        apiAuthenticate(apiKey);

        // action.info(`The Info message token : ${apiKey}`)
        action.info(`Github Repo url : ${repoUrl}`)
        action.info(`Scan types : ${scanTypesInList}`)


    } catch (err) {
        console.log("Error: ", err)
        action.setFailed(`Scan failed: ${err.message}`);
    }
}

async function apiAuthenticate(apiKey) {
    try {
        const request = {
            apiKey: apiKey
        }
        const DEFAULT_URL = "https://api.vigilnz.com"
        const ACCESS_TOKEN_URL = DEFAULT_URL + "/auth/api-key"
        const SCAN_URL = DEFAULT_URL + "/scan-targets/multi-scan"

        const response = await fetch(ACCESS_TOKEN_URL, { method: "POST", headers: { ['Content-Type']: "application/json" }, body: JSON.stringify({ apiKey }) })
        const data = await response.json(); // parse JSON response
        console.log("Response status:", response.status);
        console.log("Response data:", data);
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        return data;
    } catch (error) {
        console.error("Error in apiAuthenticate:", error);
    }
}

console.log("Custom Github Action Created")
runScan()