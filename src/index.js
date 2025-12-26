const action = require("@actions/core")

const DEFAULT_URL = "https://api.vigilnz.com"
const ACCESS_TOKEN_URL = DEFAULT_URL + "/auth/api-key"
const SCAN_URL = DEFAULT_URL + "/scan-targets/multi-scan"


async function runScan() {

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

        // action.info(`The Info message token : ${apiKey}`)
        action.info(`Github Repo url : ${repoUrl}`)
        action.info(`Scan types : ${scanTypesInList}`)

        const tokenResponse = await apiAuthenticate(apiKey);
        if (tokenResponse?.status === 200) {
            try {
                const scanApiRequest = {
                    scanTypes: scanTypesInList,
                    // gitRepoUrl: repoUrl
                    gitRepoUrl: "https://github.com/Susenthiran28/nextjs_project"
                }
                const response = await fetch(SCAN_URL, {
                    method: "POST",
                    headers: {
                        ['Content-Type']: "application/json",
                        "Authorization": `Bearer ${tokenResponse?.access_token}`
                    },
                    body: JSON.stringify(scanApiRequest)
                })
                const data = await response.json(); // parse JSON response
                console.log("Scan API Response status:", data.status);
                console.log("Scan API Response :", data);
            } catch (error) {
                console.log("Error in Scan API:", data)
            }
        }

    } catch (err) {
        console.log("Error: ", err)
        action.setFailed(`Scan failed: ${err.message}`);
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
        console.log("Access Token Response:", data);
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        return { ...data, status: response?.status };
    } catch (error) {
        console.error("Error in apiAuthenticate:", error);
        return null;
    }
}

console.log("Custom Github Action Created")
runScan()