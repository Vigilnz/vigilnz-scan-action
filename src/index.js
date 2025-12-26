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
        }

        if (!scanTypes) {
            action.setFailed(`Scan Types not mentioned`);
        }

        let scanTypesInList = []
        if (scanTypes?.trim() !== "") {
            scanTypesInList = scanTypes?.split(",")?.flatMap((type) => type.trim());
        }

        action.info("The Info message token : ", apiKey)
        action.info("The Info message repoUrl : ", repoUrl)
        action.info("The Info message types : ", scanTypesInList)

    } catch (err) {
        console.log("Error: ", err)
        action.setFailed(`Scan failed: ${err.message}`);
    }
}

console.log("Custom Github Action Created")
runScan()