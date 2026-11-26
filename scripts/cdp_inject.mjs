#!/usr/bin/env node
// -*- coding: utf-8 -*-

/**
 * Zero-ASAR-Patch CDP Injector & Untranslated String Prober for agy-chinese.
 *
 * Inspired by CHANPAJN/antigravity-langpack:
 * - Connects to local Antigravity CDP debugging port (127.0.0.1) without modifying app.asar.
 * - Useful for macOS code-signature preservation, quick testing, and automated UI probing.
 *
 * Usage:
 *   node scripts/cdp_inject.mjs                  # One-shot inject into active windows
 *   node scripts/cdp_inject.mjs --watch          # Keep watching new targets/navigations
 *   node scripts/cdp_inject.mjs --lang en        # Toggle active windows to original English
 *   node scripts/cdp_inject.mjs --lang zh-CN     # Toggle active windows to Simplified Chinese
 *   node scripts/cdp_inject.mjs --dump-untranslated  # Probe visible untranslated English UI strings
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, "i18n_data.json");
const RUNNER_PATH = path.join(__dirname, "i18n_runner.js");

function parseArgs(argv) {
    const opts = {
        port: null,
        watch: false,
        lang: null,
        dumpUntranslated: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--watch") {
            opts.watch = true;
        } else if (arg === "--dump-untranslated") {
            opts.dumpUntranslated = true;
        } else if (arg === "--port" && argv[i + 1]) {
            opts.port = Number(argv[++i]);
        } else if (arg === "--lang" && argv[i + 1]) {
            opts.lang = argv[++i];
        } else if (arg === "--help" || arg === "-h") {
            console.log(
                "Usage: node scripts/cdp_inject.mjs [--port <n>] [--watch] [--lang zh-CN|en] [--dump-untranslated]"
            );
            process.exit(0);
        }
    }
    return opts;
}

function getCandidateUserDataDirs() {
    const dirs = [];
    if (process.platform === "win32") {
        if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, "Antigravity"));
    } else if (process.platform === "darwin") {
        dirs.push(path.join(os.homedir(), "Library", "Application Support", "Antigravity"));
    } else {
        dirs.push(path.join(os.homedir(), ".config", "Antigravity"));
    }
    return dirs;
}

function readDevToolsActivePort() {
    for (const dir of getCandidateUserDataDirs()) {
        const portFile = path.join(dir, "DevToolsActivePort");
        if (fs.existsSync(portFile)) {
            try {
                const lines = fs.readFileSync(portFile, "utf-8").trim().split(/\r?\n/);
                const port = Number(lines[0]);
                if (Number.isInteger(port) && port > 0 && port < 65536) {
                    return port;
                }
            } catch (_e) {}
        }
    }
    return null;
}

function httpGetJson(url, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: timeoutMs }, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            let body = "";
            res.setEncoding("utf-8");
            res.on("data", (chunk) => { body += chunk; });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy(new Error("Request timeout"));
        });
    });
}

async function discoverCdpPort(explicitPort) {
    const candidates = [];
    if (explicitPort) candidates.push(explicitPort);
    const activePort = readDevToolsActivePort();
    if (activePort && !candidates.includes(activePort)) candidates.push(activePort);
    for (const fallback of [1096, 9222, 9229]) {
        if (!candidates.includes(fallback)) candidates.push(fallback);
    }

    for (const port of candidates) {
        try {
            const targets = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
            if (Array.isArray(targets)) {
                return { port, targets };
            }
        } catch (_e) {}
    }
    return null;
}

/**
 * Minimal RFC 6455 loopback WebSocket client so Node 18+ works with zero npm dependencies.
 */
function createLoopbackWebSocket(wsUrl) {
    if (typeof globalThis.WebSocket === "function") {
        return new Promise((resolve, reject) => {
            const ws = new globalThis.WebSocket(wsUrl);
            ws.addEventListener("open", () => resolve(wrapNativeWs(ws)));
            ws.addEventListener("error", (err) => reject(err.error || new Error("WebSocket error")));
        });
    }

    const parsed = new URL(wsUrl);
    const host = parsed.hostname || "127.0.0.1";
    const port = Number(parsed.port || 80);
    const pathAndQuery = `${parsed.pathname}${parsed.search}`;
    const key = crypto.randomBytes(16).toString("base64");

    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host, port });
        let handshakeDone = false;
        let buffer = Buffer.alloc(0);
        const listeners = { message: [], close: [] };

        socket.on("connect", () => {
            const req =
                `GET ${pathAndQuery} HTTP/1.1\r\n` +
                `Host: ${host}:${port}\r\n` +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                `Sec-WebSocket-Key: ${key}\r\n` +
                "Sec-WebSocket-Version: 13\r\n\r\n";
            socket.write(req);
        });

        socket.on("error", (err) => {
            if (!handshakeDone) reject(err);
        });

        socket.on("close", () => {
            for (const fn of listeners.close) fn();
        });

        socket.on("data", (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            if (!handshakeDone) {
                const idx = buffer.indexOf("\r\n\r\n");
                if (idx === -1) return;
                const header = buffer.subarray(0, idx).toString("utf-8");
                if (!header.includes("101")) {
                    reject(new Error(`WebSocket upgrade failed: ${header.split("\r\n")[0]}`));
                    socket.destroy();
                    return;
                }
                handshakeDone = true;
                buffer = buffer.subarray(idx + 4);
                resolve({
                    send(text) {
                        sendWsTextFrame(socket, text);
                    },
                    onMessage(fn) {
                        listeners.message.push(fn);
                    },
                    onClose(fn) {
                        listeners.close.push(fn);
                    },
                    close() {
                        socket.end();
                    },
                });
            }

            while (buffer.length >= 2) {
                const b0 = buffer[0];
                const b1 = buffer[1];
                const opcode = b0 & 0x0f;
                const masked = (b1 & 0x80) !== 0;
                let payloadLen = b1 & 0x7f;
                let offset = 2;

                if (payloadLen === 126) {
                    if (buffer.length < 4) break;
                    payloadLen = buffer.readUInt16BE(2);
                    offset = 4;
                } else if (payloadLen === 127) {
                    if (buffer.length < 10) break;
                    payloadLen = Number(buffer.readBigUInt64BE(2));
                    offset = 10;
                }

                if (masked) offset += 4;
                if (buffer.length < offset + payloadLen) break;

                let payload = buffer.subarray(offset, offset + payloadLen);
                if (masked) {
                    const maskKey = buffer.subarray(offset - 4, offset);
                    payload = Buffer.from(payload);
                    for (let i = 0; i < payload.length; i++) {
                        payload[i] ^= maskKey[i % 4];
                    }
                }
                buffer = buffer.subarray(offset + payloadLen);

                if (opcode === 0x8) {
                    socket.end();
                    break;
                } else if (opcode === 0x9) {
                    // Ping -> Pong
                    const pong = Buffer.alloc(2);
                    pong[0] = 0x8a;
                    pong[1] = 0x00;
                    socket.write(pong);
                } else if (opcode === 0x1) {
                    const msg = payload.toString("utf-8");
                    for (const fn of listeners.message) fn(msg);
                }
            }
        });
    });
}

function sendWsTextFrame(socket, text) {
    const data = Buffer.from(text, "utf-8");
    const len = data.length;
    const mask = crypto.randomBytes(4);
    let header;
    if (len < 126) {
        header = Buffer.alloc(6);
        header[0] = 0x81;
        header[1] = 0x80 | len;
        mask.copy(header, 2);
    } else if (len < 65536) {
        header = Buffer.alloc(8);
        header[0] = 0x81;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(len, 2);
        mask.copy(header, 4);
    } else {
        header = Buffer.alloc(14);
        header[0] = 0x81;
        header[1] = 0x80 | 127;
        header.writeBigUInt64BE(BigInt(len), 2);
        mask.copy(header, 10);
    }
    const maskedData = Buffer.from(data);
    for (let i = 0; i < maskedData.length; i++) {
        maskedData[i] ^= mask[i % 4];
    }
    socket.write(Buffer.concat([header, maskedData]));
}

function wrapNativeWs(ws) {
    const msgListeners = [];
    const closeListeners = [];
    ws.addEventListener("message", (ev) => {
        const text = typeof ev.data === "string" ? ev.data : String(ev.data);
        for (const fn of msgListeners) fn(text);
    });
    ws.addEventListener("close", () => {
        for (const fn of closeListeners) fn();
    });
    return {
        send(text) {
            ws.send(text);
        },
        onMessage(fn) {
            msgListeners.push(fn);
        },
        onClose(fn) {
            closeListeners.push(fn);
        },
        close() {
            ws.close();
        },
    };
}

class CdpClient {
    constructor(conn) {
        this.conn = conn;
        this.nextId = 1;
        this.pending = new Map();
        this.eventHandlers = new Map();
        this.conn.onMessage((raw) => {
            let msg;
            try {
                msg = JSON.parse(raw);
            } catch (_e) {
                return;
            }
            if (msg.id && this.pending.has(msg.id)) {
                const { resolve, reject } = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) {
                    reject(new Error(msg.error.message || JSON.stringify(msg.error)));
                } else {
                    resolve(msg.result);
                }
            } else if (msg.method) {
                const handlers = this.eventHandlers.get(msg.method);
                if (handlers) {
                    for (const fn of handlers) fn(msg.params || {});
                }
            }
        });
        this.conn.onClose(() => {
            for (const { reject } of this.pending.values()) {
                reject(new Error("CDP connection closed"));
            }
            this.pending.clear();
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
            this.conn.send(JSON.stringify({ id, method, params }));
        });
    }

    on(method, handler) {
        if (!this.eventHandlers.has(method)) {
            this.eventHandlers.set(method, []);
        }
        this.eventHandlers.get(method).push(handler);
    }

    close() {
        this.conn.close();
    }
}

function buildPayloadScript() {
    const dataObj = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
    const runnerCode = fs.readFileSync(RUNNER_PATH, "utf-8");
    return (
        "(function(){try{window.__ANTIGRAVITY_I18N_DATA__=" +
        JSON.stringify(dataObj) +
        ";" +
        runnerCode +
        "}catch(e){console.error('[Antigravity i18n CDP]',e);}})();"
    );
}

function isInjectableTarget(t) {
    if (!t || !t.webSocketDebuggerUrl) return false;
    if (t.url && t.url.startsWith("devtools://")) return false;
    return t.type === "page" || t.type === "webview" || t.type === "app";
}

async function injectTarget(target, payloadScript, langOverride) {
    const conn = await createLoopbackWebSocket(target.webSocketDebuggerUrl);
    const client = new CdpClient(conn);
    try {
        await client.send("Runtime.evaluate", {
            expression: payloadScript,
            returnByValue: false,
        });
        if (langOverride) {
            await client.send("Runtime.evaluate", {
                expression: `window.__antigravity_setLang && window.__antigravity_setLang(${JSON.stringify(langOverride)});`,
                returnByValue: false,
            });
        }
    } finally {
        client.close();
    }
}

async function probeUntranslated(target) {
    const probeExpr = `(function(){
        var out = [];
        var seen = Object.create(null);
        var excludedTags = { SCRIPT:1, STYLE:1, NOSCRIPT:1, PRE:1, CODE:1, TEXTAREA:1, KBD:1, SAMP:1 };
        var excludedCls = ["monaco-editor", "view-lines", "xterm", "cm-editor", "CodeMirror", "hljs", "shiki", "token", "syntax"];
        function ignored(node) {
            var c = node;
            while (c && c !== document.body && c !== document.documentElement) {
                if (c.nodeType === 1) {
                    if (excludedTags[c.tagName] || c.isContentEditable) return true;
                    if (c.getAttribute && (c.getAttribute("data-i18n-ignore") === "true" || c.getAttribute("role") === "textbox")) return true;
                    var cls = c.className;
                    if (typeof cls === "string" && cls) {
                        for (var i = 0; i < excludedCls.length; i++) {
                            if (cls.indexOf(excludedCls[i]) !== -1) return true;
                        }
                    }
                }
                c = c.parentNode;
            }
            return false;
        }
        function scan(root) {
            if (!root) return;
            var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
            var n;
            while ((n = w.nextNode())) {
                if (ignored(n)) continue;
                var t = (n.nodeValue || "").trim();
                if (!t || t.length < 2 || t.length > 180) continue;
                if (!/[A-Za-z]{2,}/.test(t) || /[\u4e00-\u9fa5]/.test(t)) continue;
                if (/^(https?:\\/\\/|\\/|[A-Za-z]:\\\\)/.test(t)) continue;
                if (!seen[t]) { seen[t] = true; out.push(t); }
            }
            var els = root.querySelectorAll ? root.querySelectorAll("*") : [];
            for (var i = 0; i < els.length; i++) {
                if (els[i].shadowRoot) scan(els[i].shadowRoot);
            }
        }
        scan(document.body || document.documentElement);
        return out;
    })()`;

    const conn = await createLoopbackWebSocket(target.webSocketDebuggerUrl);
    const client = new CdpClient(conn);
    try {
        const res = await client.send("Runtime.evaluate", {
            expression: probeExpr,
            returnByValue: true,
        });
        return (res && res.result && res.result.value) || [];
    } finally {
        client.close();
    }
}

async function watchTarget(target, payloadScript, attachedIds) {
    if (attachedIds.has(target.id)) return;
    attachedIds.add(target.id);
    try {
        const conn = await createLoopbackWebSocket(target.webSocketDebuggerUrl);
        const client = new CdpClient(conn);
        await client.send("Page.enable").catch(() => {});
        await client.send("Runtime.enable").catch(() => {});
        await client.send("Page.addScriptToEvaluateOnNewDocument", { source: payloadScript }).catch(() => {});
        await client.send("Runtime.evaluate", { expression: payloadScript }).catch(() => {});

        client.on("Page.frameNavigated", () => {
            client.send("Runtime.evaluate", { expression: payloadScript }).catch(() => {});
        });
        client.on("Runtime.executionContextCreated", () => {
            client.send("Runtime.evaluate", { expression: payloadScript }).catch(() => {});
        });
        conn.onClose(() => {
            attachedIds.delete(target.id);
        });
        console.log(`[✓] CDP 已持续挂载目标: ${target.title || target.url || target.id}`);
    } catch (err) {
        attachedIds.delete(target.id);
        console.warn(`[!] 挂载目标失败 (${target.id}): ${err.message}`);
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    for (const p of [DATA_PATH, RUNNER_PATH]) {
        if (!fs.existsSync(p)) {
            console.error(`[错误] 缺少文件: ${p}`);
            process.exit(1);
        }
    }

    const discovered = await discoverCdpPort(opts.port);
    if (!discovered) {
        console.error("[错误] 未检测到开启 CDP 调试端口的 Antigravity 实例。");
        console.error("请使用 [启动Antigravity(自动检查汉化).bat] 或附带 --remote-debugging-port=0 启动客户端。");
        process.exit(1);
    }

    const { port, targets } = discovered;
    const activeTargets = targets.filter(isInjectableTarget);
    console.log(`[✓] 已连接本地 CDP 端口 127.0.0.1:${port}，发现 ${activeTargets.length} 个可注入页面。`);

    if (opts.dumpUntranslated) {
        const allStrings = new Set();
        for (const t of activeTargets) {
            try {
                const list = await probeUntranslated(t);
                for (const s of list) allStrings.add(s);
            } catch (err) {
                console.warn(`[!] 探测目标失败 (${t.title || t.id}): ${err.message}`);
            }
        }
        const dict = Object.fromEntries([...allStrings].map((s) => [s, ""]));
        console.log(JSON.stringify(dict, null, 2));
        return;
    }

    const payloadScript = buildPayloadScript();
    if (opts.watch) {
        const attachedIds = new Set();
        for (const t of activeTargets) {
            await watchTarget(t, payloadScript, attachedIds);
        }
        console.log("[*] 进入事件监听守护模式（按 Ctrl+C 退出）...");
        setInterval(async () => {
            try {
                const latest = await httpGetJson(`http://127.0.0.1:${port}/json/list`);
                if (Array.isArray(latest)) {
                    for (const t of latest.filter(isInjectableTarget)) {
                        if (!attachedIds.has(t.id)) {
                            await watchTarget(t, payloadScript, attachedIds);
                        }
                    }
                }
            } catch (_e) {}
        }, 3000);
        return;
    }

    let okCount = 0;
    for (const t of activeTargets) {
        try {
            await injectTarget(t, payloadScript, opts.lang);
            okCount++;
            console.log(`[✓] 已注入: ${t.title || t.url || t.id}`);
        } catch (err) {
            console.warn(`[!] 注入失败 (${t.title || t.id}): ${err.message}`);
        }
    }
    console.log(`[✓] 完成，共注入 ${okCount}/${activeTargets.length} 个目标。`);
}

main().catch((err) => {
    console.error(`[错误] ${err.message}`);
    process.exit(1);
});
