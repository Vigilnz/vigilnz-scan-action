const action = require("@actions/core")

function runScan() {

    try {
        console.log("Scan Started")
        const apiKey = action.getInput("vigilnzApiKey")
        action.info("The Info message")
    } catch (err) {
        console.log("Error: ", err)
        action.setFailed(`Scan failed: ${err.message}`);
    }
}

console.log("Custom Github Action Created")
runScan()