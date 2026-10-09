#!/usr/bin/env node
"use strict";

const readline = require("readline");

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
function log(level, event) {
    process.stderr.write(JSON.stringify({ level: level, event: event }) + "\n");
}

input.on("line", function (line) {
    let request;
    try {
        request = JSON.parse(line);
    } catch (error) {
        log("error", "writer.worker.invalid_request");
        process.stdout.write(JSON.stringify({ status: "error", error: "invalid_request" }) + "\n");
        return;
    }

    if (!request || request.command !== "status") {
        log("warn", "writer.worker.unsupported_command");
        process.stdout.write(JSON.stringify({ status: "error", error: "unsupported_command" }) + "\n");
        return;
    }

    log("info", "writer.worker.status_requested");
    process.stdout.write(JSON.stringify({ status: "ok", service: "mendeley-writer-worker" }) + "\n");
    log("success", "writer.worker.status_ready");
    input.close();
});
