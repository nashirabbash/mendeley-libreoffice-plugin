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

const workerApi = require(worker);
const originalFetch = global.fetch;

(async function () {
    try {
        let registeredState;
        global.fetch = async function (url, options) {
            assert.strictEqual(url, "http://127.0.0.1:8080/writer/state");
            registeredState = JSON.parse(options.body).state;
            return { ok: true };
        };
        const oauth = await workerApi.request({ command: "begin_oauth" });
        assert.match(registeredState, /^writer-[a-f0-9]{48}$/);
        assert.strictEqual(new URL(oauth.url).searchParams.get("state"), registeredState);
        assert.strictEqual(new URL(oauth.url).searchParams.get("redirect_uri"), "http://localhost:8080/");

        global.fetch = async function (url, options) {
            assert.strictEqual(options.headers.Authorization, "Bearer private-test-token");
            assert.strictEqual(new URL(url).searchParams.get("query"), "Ada Lovelace");
            return {
                ok: true,
                status: 200,
                json: async function () {
                    return [{
                        title: "Notes on the Analytical Engine",
                        authors: [{ first_name: "Ada", last_name: "Lovelace" }],
                        year: "1843",
                        access_token: "must-not-escape"
                    }];
                }
            };
        };
        assert.deepStrictEqual(await workerApi.request({
            command: "search",
            token: "private-test-token",
            query: "Ada Lovelace"
        }), {
            status: "ok",
            items: [{
                title: "Notes on the Analytical Engine",
                authors: ["Ada Lovelace"],
                year: "1843"
            }]
        });

        global.fetch = async function () {
            return { ok: false, status: 401 };
        };
        assert.deepStrictEqual(await workerApi.request({
            command: "search",
            token: "private-test-token",
            query: "Ada Lovelace"
        }), { status: "unauthorized" });
    } finally {
        global.fetch = originalFetch;
    }
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
