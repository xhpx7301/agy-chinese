'use strict';

/**
 * Lightweight Main-Process IPC Handler for agy-chinese Thought Translator (MIT License).
 * - Zero background daemon, zero extra ports, zero external npm dependencies.
 * - Uses Electron net.fetch (inherits OS system proxy automatically) when available.
 * - Persists optional AI credentials strictly in userData/agy_chinese_thought.json (0600).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG = {
    mode: 'off',          // 'off' | 'machine' | 'ai'
    viewMode: 'bilingual',// 'bilingual' | 'immersive'
    triggerMode: 'expand',// 'expand' | 'auto'
    aiBaseUrl: '',
    aiApiKey: '',
    aiModel: '',
    aiStyle: 'technical', // 'technical' | 'concise'
};

const SYSTEM_PROMPTS = {
    technical:
        'You are a senior software engineering reasoning translator. Translate the input model Chain-of-Thought into natural first-person ("I" -> "我") Simplified Chinese engineering notes. Preserve ALL code identifiers, function/class names, file paths, line numbers (such as path/file.js#L12), terminal commands, and backtick formatting verbatim. Faithfully preserve causal reasoning without inventing facts or adding headings/preambles. Output the translated Chinese reasoning body directly.',
    concise:
        'You are a concise software engineering reasoning summarizer. Distill and translate the input model Chain-of-Thought into crisp first-person ("我") Simplified Chinese reasoning bullets/notes. Strictly preserve exact file paths, line numbers, key code identifiers, and core conclusions while removing repetitive hesitation. Output the Chinese body directly with no extra preamble.',
};

function getConfigPath(app) {
    try {
        return path.join(app.getPath('userData'), 'agy_chinese_thought.json');
    } catch (_e) {
        return '';
    }
}

function normalizeConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const mode = src.mode === 'machine' || src.mode === 'ai' ? src.mode : 'off';
    const viewMode = src.viewMode === 'immersive' ? 'immersive' : 'bilingual';
    const triggerMode = src.triggerMode === 'auto' ? 'auto' : 'expand';
    const aiStyle = src.aiStyle === 'concise' ? 'concise' : 'technical';
    return {
        mode,
        viewMode,
        triggerMode,
        aiBaseUrl: typeof src.aiBaseUrl === 'string' ? src.aiBaseUrl.trim() : '',
        aiApiKey: typeof src.aiApiKey === 'string' ? src.aiApiKey.trim() : '',
        aiModel: typeof src.aiModel === 'string' ? src.aiModel.trim() : '',
        aiStyle,
    };
}

function sanitizeConfigForRenderer(cfg) {
    return {
        mode: cfg.mode,
        viewMode: cfg.viewMode,
        triggerMode: cfg.triggerMode,
        aiBaseUrl: cfg.aiBaseUrl,
        aiModel: cfg.aiModel,
        aiStyle: cfg.aiStyle,
        hasApiKey: Boolean(cfg.aiApiKey),
    };
}

function loadConfig(app) {
    const cfgPath = getConfigPath(app);
    if (!cfgPath || !fs.existsSync(cfgPath)) {
        return { ...DEFAULT_CONFIG };
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
        return normalizeConfig(parsed);
    } catch (_e) {
        return { ...DEFAULT_CONFIG };
    }
}

function saveConfig(app, incoming, existing) {
    const prev = existing || loadConfig(app);
    const nextRaw = { ...prev, ...(incoming && typeof incoming === 'object' ? incoming : {}) };
    if (incoming && incoming.clearApiKey === true) {
        nextRaw.aiApiKey = '';
    } else if (!incoming || incoming.aiApiKey === '__KEEP__' || incoming.aiApiKey === undefined) {
        nextRaw.aiApiKey = prev.aiApiKey;
    }
    const normalized = normalizeConfig(nextRaw);
    const cfgPath = getConfigPath(app);
    if (cfgPath) {
        fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
        fs.writeFileSync(cfgPath, JSON.stringify(normalized, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
    }
    return normalized;
}

function validateAiEndpoint(rawBaseUrl) {
    const trimmed = String(rawBaseUrl || '').trim();
    if (!trimmed) {
        throw new Error('请先填写 AI 模型接口地址 (Base URL)');
    }
    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch (_e) {
        throw new Error('Base URL 格式无效');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('仅支持 http 或 https 协议的 Base URL');
    }
    const host = (parsed.hostname || '').toLowerCase();
    if (host === '169.254.169.254' || host === 'metadata.google.internal') {
        throw new Error('已阻止访问受保护的元数据地址');
    }
    const clean = parsed.toString().replace(/\/+$/, '');
    return clean.endsWith('/chat/completions') ? clean : clean + '/chat/completions';
}

function splitTextChunks(text, maxLen) {
    const src = String(text || '');
    if (src.length <= maxLen) return [src];
    const lines = src.split('\n');
    const chunks = [];
    let current = '';
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const candidate = current ? current + '\n' + line : line;
        if (candidate.length <= maxLen) {
            current = candidate;
            continue;
        }
        if (current) {
            chunks.push(current);
            current = '';
        }
        if (line.length <= maxLen) {
            current = line;
        } else {
            for (let off = 0; off < line.length; off += maxLen) {
                chunks.push(line.slice(off, off + maxLen));
            }
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

function getNetFetch(electron) {
    if (electron && electron.net && typeof electron.net.fetch === 'function') {
        return electron.net.fetch.bind(electron.net);
    }
    if (typeof fetch === 'function') {
        return fetch;
    }
    throw new Error('当前运行时不支持 fetch');
}

async function translateViaMachine(netFetch, text) {
    const chunks = splitTextChunks(text, 1600);
    const out = [];
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk.trim()) {
            out.push(chunk);
            continue;
        }
        const url =
            'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=' +
            encodeURIComponent(chunk);
        const res = await netFetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
            throw new Error('机翻接口请求失败 (HTTP ' + res.status + ')');
        }
        const data = await res.json();
        const segs = Array.isArray(data && data[0]) ? data[0] : [];
        let joined = '';
        for (let j = 0; j < segs.length; j++) {
            if (Array.isArray(segs[j]) && typeof segs[j][0] === 'string') {
                joined += segs[j][0];
            }
        }
        out.push(joined || chunk);
    }
    return out.join('\n');
}

async function translateViaAi(netFetch, text, cfg) {
    const endpoint = validateAiEndpoint(cfg.aiBaseUrl);
    if (!cfg.aiModel) {
        throw new Error('请先填写模型名称 (Model)');
    }
    const prompt = SYSTEM_PROMPTS[cfg.aiStyle] || SYSTEM_PROMPTS.technical;
    const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
    if (cfg.aiApiKey) {
        headers.Authorization = 'Bearer ' + cfg.aiApiKey;
    }
    const res = await netFetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: cfg.aiModel,
            temperature: 0.2,
            max_tokens: 4096,
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: String(text || '') },
            ],
        }),
        signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error('AI 接口返回 HTTP ' + res.status + (errBody ? ': ' + errBody.slice(0, 160) : ''));
    }
    const json = await res.json();
    const content =
        json &&
        json.choices &&
        json.choices[0] &&
        ((json.choices[0].message && json.choices[0].message.content) || json.choices[0].text);
    if (typeof content !== 'string' || !content.trim()) {
        throw new Error('AI 接口未返回有效译文内容');
    }
    return content.trim();
}

function registerThoughtIpc(electron) {
    if (!electron || !electron.ipcMain || !electron.app) return;
    if (global.__agyChineseThoughtIpcReady) return;
    global.__agyChineseThoughtIpcReady = true;

    const { ipcMain, app } = electron;
    const netFetch = getNetFetch(electron);

    ipcMain.handle('agy-chinese:get-thought-config', () => {
        return sanitizeConfigForRenderer(loadConfig(app));
    });

    ipcMain.handle('agy-chinese:save-thought-config', (_event, incoming) => {
        try {
            const saved = saveConfig(app, incoming);
            return { ok: true, config: sanitizeConfigForRenderer(saved) };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : String(err) };
        }
    });

    ipcMain.handle('agy-chinese:test-thought-config', async (_event, incoming) => {
        const started = Date.now();
        try {
            const base = loadConfig(app);
            const merged = incoming && typeof incoming === 'object' ? saveConfig(app, incoming, base) : base;
            const sampleInput = 'I need to inspect src/main.ts#L12 before editing the handler.';
            const translated =
                merged.mode === 'ai'
                    ? await translateViaAi(netFetch, sampleInput, merged)
                    : await translateViaMachine(netFetch, sampleInput);
            return {
                ok: true,
                engine: merged.mode === 'ai' ? 'ai' : 'machine',
                sample: translated,
                latencyMs: Date.now() - started,
                config: sanitizeConfigForRenderer(merged),
            };
        } catch (err) {
            return {
                ok: false,
                error: err && err.message ? err.message : String(err),
                latencyMs: Date.now() - started,
            };
        }
    });

    ipcMain.handle('agy-chinese:translate-thought', async (_event, payload) => {
        try {
            const req = payload && typeof payload === 'object' ? payload : {};
            const text = typeof req.text === 'string' ? req.text.trim() : '';
            if (!text) return { ok: false, error: 'Empty text' };
            if (text.length > 48000) {
                throw new Error('思考内容过长，已跳过翻译');
            }
            const cfg = loadConfig(app);
            const engine = req.mode === 'ai' || req.mode === 'machine' ? req.mode : cfg.mode;
            if (engine === 'off') {
                return { ok: false, error: 'Thought translation is disabled' };
            }
            const effectiveCfg = req.style ? { ...cfg, aiStyle: req.style === 'concise' ? 'concise' : 'technical' } : cfg;
            const translated =
                engine === 'ai'
                    ? await translateViaAi(netFetch, text, effectiveCfg)
                    : await translateViaMachine(netFetch, text);
            return { ok: true, translated, engine };
        } catch (err) {
            return { ok: false, error: err && err.message ? err.message : String(err) };
        }
    });
}

module.exports = {
    registerThoughtIpc,
    sanitizeConfigForRenderer,
    splitTextChunks,
    validateAiEndpoint,
};
