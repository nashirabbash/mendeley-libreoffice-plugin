#!/usr/bin/env node
"use strict";

const readline = require("readline");
const crypto = require("crypto");

function log(level, event) {
    process.stderr.write(JSON.stringify({ level: level, event: event }) + "\n");
}

async function request(message) {
    const command = message.command;
    if (command === "status") {
        return { status: "ok", service: "mendeley-writer-worker" };
    }
    if (command === "desktop_login") {
        const health = await fetch("http://127.0.0.1:8080/health");
        if (!health.ok || (await health.json()).service !== "mendeley-loopback") {
            throw new Error("Mendeley Desktop session is unavailable.");
        }
        const response = await fetch("http://127.0.0.1:8080/token", { cache: "no-store" });
        const session = await response.json();
        if (!response.ok || !session.token) throw new Error("Sign in to Mendeley Reference Manager first.");
        return { status: "ok", token: session.token };
    }
    if (command === "begin_oauth") {
        const state = "writer-" + crypto.randomBytes(24).toString("hex");
        const response = await fetch("http://127.0.0.1:8080/writer/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: state })
        });
        if (!response.ok) throw new Error("Could not prepare secure Mendeley sign-in.");
        const url = new URL("https://api.mendeley.com/oauth/authorize");
        url.searchParams.set("client_id", "26014");
        url.searchParams.set("redirect_uri", "http://localhost:8080/");
        url.searchParams.set("response_type", "token");
        url.searchParams.set("scope", "all");
        url.searchParams.set("state", state);
        return { status: "ok", url: url.toString() };
    }
    if (command === "oauth_token") {
        const response = await fetch("http://127.0.0.1:8080/writer/token", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not read Mendeley sign-in result.");
        const session = await response.json();
        return session.token ? { status: "ok", token: session.token } : { status: "pending" };
    }
    if (command === "search") {
        const token = message.token;
        const query = (message.query || "").trim();
        if (!token || !query) throw new Error("Sign in and enter a title, author, or year.");
        const url = new URL("https://api.mendeley.com/search/documents");
        url.searchParams.set("query", query);
        url.searchParams.set("limit", "50");
        const response = await fetch(url, {
            headers: {
                Authorization: "Bearer " + token,
                Accept: "application/vnd.mendeley-document.1+json"
            }
        });
        if (response.status === 401) return { status: "unauthorized" };
        if (!response.ok) throw new Error("Mendeley search failed (HTTP " + response.status + ").");
        const items = await response.json();
        return {
            status: "ok",
            items: items.map(function (item) {
                return {
                    title: item.title || "Untitled",
                    authors: (item.authors || []).map(function (author) {
                        return [author.first_name, author.last_name].filter(Boolean).join(" ");
                    }).filter(Boolean),
                    year: item.year || ""
                };
            })
        };
    }
    if (command === "logout") {
        await fetch("http://127.0.0.1:8080/writer/token", { method: "DELETE" }).catch(function () {});
        return { status: "ok" };
    }
    throw new Error("unsupported_command");
}

async function handle(line) {
    let message;
    try {
        message = JSON.parse(line);
        const result = await request(message);
        log("success", "writer.worker." + message.command);
        process.stdout.write(JSON.stringify(result) + "\n");
    } catch (error) {
        log("error", "writer.worker.request_failed");
        process.stdout.write(JSON.stringify({ status: "error", error: error.message }) + "\n");
    }
}

if (require.main === module) {
    const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
    input.on("line", handle);
}

module.exports = { request: request };
