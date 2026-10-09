const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

const worker = path.join(__dirname, "..", "writer", "worker.js");
const result = spawnSync(process.execPath, [worker], {
    input: '{"command":"status"}\n',
    encoding: "utf8"
});

assert.strictEqual(result.status, 0, result.stderr);
assert.deepStrictEqual(JSON.parse(result.stdout), {
    status: "ok",
    service: "mendeley-writer-worker"
});

const invalidCommand = spawnSync(process.execPath, [worker], {
    input: '{"command":"unknown"}\n',
    encoding: "utf8"
});
assert.deepStrictEqual(JSON.parse(invalidCommand.stdout), {
    status: "error",
    error: "unsupported_command"
});
