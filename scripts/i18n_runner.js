(function () {
    var data = window.__ANTIGRAVITY_I18N_DATA__ || {};
    var EXACT = data.exact || {};
    var REVERSE_MAP = data.reverse_map || {};
    var REGEX_RULES = [];
    if (Array.isArray(data.regex_rules)) {
        for (var i = 0; i < data.regex_rules.length; i++) {
            try {
                REGEX_RULES.push({
                    re: new RegExp(data.regex_rules[i].pattern),
                    rep: data.regex_rules[i].replacement
                });
            } catch (e) {}
        }
    }
    var EXEMPTIONS = data.exemptions || [];

    // Always update global store on new data injection
    window.__ANTIGRAVITY_EXACT__ = Object.assign(window.__ANTIGRAVITY_EXACT__ || {}, EXACT);
    window.__ANTIGRAVITY_REVERSE_MAP__ = Object.assign(window.__ANTIGRAVITY_REVERSE_MAP__ || {}, REVERSE_MAP);
    window.__ANTIGRAVITY_REGEX_RULES__ = REGEX_RULES;
    window.__ANTIGRAVITY_EXEMPTIONS__ = EXEMPTIONS;

    var RUNNER_VERSION = "2026.11.26.8";

    if (window.__antigravity_i18n_runner_active) {
        if (window.__antigravity_runner_version === RUNNER_VERSION) {
            if (typeof window.__antigravity_translateWholePage === "function" &&
                (typeof window.__antigravity_getLang !== "function" || window.__antigravity_getLang() !== "en")) {
                window.__antigravity_translateWholePage();
            }
            if (typeof window.__antigravity_ensureAppearancePanel === "function") {
                window.__antigravity_ensureAppearancePanel();
            }
            return;
        }
        if (typeof window.__antigravity_runner_cleanup === "function") {
            try { window.__antigravity_runner_cleanup(); } catch (e) {}
        }
    }
    window.__antigravity_i18n_runner_active = true;
    window.__antigravity_runner_version = RUNNER_VERSION;

    // 1. Controlled Component Reverse Map Hook (Protects Base UI / Radix Select states)
    if (!window.__antigravity_map_hooked) {
        window.__antigravity_map_hooked = true;
        var origHas = Map.prototype.has;
        var origGet = Map.prototype.get;

        Map.prototype.has = function (key) {
            if (origHas.call(this, key)) return true;
            var rev = window.__ANTIGRAVITY_REVERSE_MAP__ || REVERSE_MAP;
            if (typeof key === "string") {
                var mapped = rev[key] || rev[key.trim()];
                if (mapped) return origHas.call(this, mapped);
            }
            return false;
        };

        Map.prototype.get = function (key) {
            var val = origGet.call(this, key);
            if (val !== undefined) return val;
            var rev = window.__ANTIGRAVITY_REVERSE_MAP__ || REVERSE_MAP;
            if (typeof key === "string") {
                var mapped = rev[key] || rev[key.trim()];
                if (mapped) return origGet.call(this, mapped);
            }
            return undefined;
        };
    }

    var STORAGE_KEY = "__antigravity_i18n_lang__";
    function loadSavedLang() {
        try {
            var v = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
            if (v === "en" || v === "zh-CN") return v;
        } catch (e) {}
        return "zh-CN";
    }
    function saveLang(lang) {
        try {
            if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, lang);
        } catch (e) {}
    }

    var currentLang = loadSavedLang();
    var origTextMap = new WeakMap();
    var origAttrMap = new WeakMap();

    // 2. Isolation & Exemption Checks
    var EXCLUDED_TAGS = {
        "SCRIPT": true,
        "STYLE": true,
        "NOSCRIPT": true,
        "PRE": true,
        "CODE": true,
        "TEXTAREA": true,
        "KBD": true,
        "SAMP": true
    };

    var EXCLUDED_CLASS_MARKERS = [
        "monaco-editor",
        "monaco-diff-editor",
        "view-lines",
        "xterm",
        "cm-editor",
        "cm-content",
        "CodeMirror",
        "code-block",
        "hljs",
        "shiki",
        "token",
        "syntax",
        "post-body",
        "post-md",
        "raw-pre",
        "swarm-title"
    ];

    var EXCLUDED_TESTID_EXACT = {
        "planner-response-text": true,
        "user-input-step": true
    };

    var EXCLUDED_TESTID_MARKERS = [
        "diff",
        "code-viewer",
        "file-viewer",
        "file-content",
        "editor-content",
        "terminal"
    ];

    function isInsideEditorOrOwnUi(node) {
        var curr = node;
        while (curr && curr !== document.body && curr !== document.documentElement) {
            if (curr.nodeType === 1) {
                if (curr.id === "__antigravity_i18n_toast__" || curr.id === "__antigravity_i18n_lang_panel__") return true;
                var tag = curr.tagName;
                if (tag === "TEXTAREA" || tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return true;
                if (curr.isContentEditable) return true;
                if (curr.getAttribute && curr.getAttribute("data-i18n-ignore") === "true") return true;
                var cls = curr.className;
                if (typeof cls === "string" && cls) {
                    if (cls.indexOf("monaco-editor") !== -1 ||
                        cls.indexOf("monaco-diff-editor") !== -1 ||
                        cls.indexOf("xterm") !== -1 ||
                        cls.indexOf("cm-editor") !== -1 ||
                        cls.indexOf("CodeMirror") !== -1 ||
                        cls.indexOf("__ag_thought_box__") !== -1) {
                        return true;
                    }
                }
            }
            curr = curr.parentNode;
        }
        return false;
    }

    function isInsideExcluded(node) {
        var curr = node;
        while (curr && curr !== document.body && curr !== document.documentElement) {
            if (curr.nodeType === 1) {
                if (curr.id === "__antigravity_i18n_toast__" || curr.id === "ov-frame") return true;
                var tag = curr.tagName;
                if (EXCLUDED_TAGS[tag]) return true;
                if (curr.isContentEditable) return true;
                if (curr.getAttribute) {
                    if (curr.getAttribute("data-i18n-ignore") === "true" ||
                        curr.getAttribute("translate") === "no" ||
                        curr.getAttribute("data-no-translate") === "true" ||
                        curr.getAttribute("data-ag-localization-skip") === "true" ||
                        curr.getAttribute("data-agy-no-translate") === "true" ||
                        curr.getAttribute("data-antigravity-zh-skip") === "1" ||
                        curr.hasAttribute("data-markdown-root") ||
                        curr.hasAttribute("data-agy-powertools-root") ||
                        curr.hasAttribute("data-agy-management-page")) {
                        return true;
                    }
                    var role = curr.getAttribute("role");
                    if (role === "textbox" || role === "code") return true;
                    var tid = curr.getAttribute("data-testid");
                    if (tid) {
                        if (EXCLUDED_TESTID_EXACT[tid]) return true;
                        for (var ti = 0; ti < EXCLUDED_TESTID_MARKERS.length; ti++) {
                            if (tid.indexOf(EXCLUDED_TESTID_MARKERS[ti]) !== -1) return true;
                        }
                    }
                }
                var cls = curr.className;
                if (typeof cls === "string" && cls) {
                    for (var i = 0; i < EXCLUDED_CLASS_MARKERS.length; i++) {
                        if (cls.indexOf(EXCLUDED_CLASS_MARKERS[i]) !== -1) {
                            return true;
                        }
                    }
                }
            }
            curr = curr.parentNode;
        }
        return false;
    }

    function isExempt(text) {
        var exemptions = window.__ANTIGRAVITY_EXEMPTIONS__ || EXEMPTIONS;
        for (var i = 0; i < exemptions.length; i++) {
            if (text.indexOf(exemptions[i]) !== -1) {
                return true;
            }
        }
        return false;
    }

    function getTranslatedText(original) {
        var trimmed = original.trim();
        if (!trimmed) return null;
        if (isExempt(original)) return null;

        var norm = trimmed.replace(/\s+/g, " ");
        var exactMap = window.__ANTIGRAVITY_EXACT__ || EXACT;
        var regexList = window.__ANTIGRAVITY_REGEX_RULES__ || REGEX_RULES;

        // Exact match (also try whitespace-normalized key)
        var target = exactMap[trimmed] || exactMap[norm];
        if (target) {
            var leading = original.match(/^\s*/)[0];
            var trailing = original.match(/\s*$/)[0];
            return leading + target + trailing;
        }

        // Regex dynamic rules
        for (var i = 0; i < regexList.length; i++) {
            var testStr = regexList[i].re.test(trimmed) ? trimmed : (regexList[i].re.test(norm) ? norm : null);
            if (testStr !== null) {
                var replaced = testStr.replace(regexList[i].re, regexList[i].rep);
                replaced = replaced
                    .replace(/(\d+)\s*days?/gi, "$1 天")
                    .replace(/(\d+)\s*hours?/gi, "$1 小时")
                    .replace(/(\d+)\s*minutes?/gi, "$1 分钟")
                    .replace(/(\d+)\s*seconds?/gi, "$1 秒")
                    .replace(/(\d+\s*天),\s*(\d+\s*小时)/g, "$1 $2")
                    .replace(/(\d+\s*小时),\s*(\d+\s*分钟)/g, "$1 $2");
                var lead = original.match(/^\s*/)[0];
                var trail = original.match(/\s*$/)[0];
                return lead + replaced + trail;
            }
        }

        return null;
    }

    // 3. Node Translation & WeakMap Original-Text Engine (Value matching + live revert)
    function translateTextNode(textNode) {
        if (!textNode || textNode.nodeType !== 3) return;
        if (currentLang === "en") return;
        var val = textNode.nodeValue;
        if (!val || !val.trim()) return;

        if (isInsideExcluded(textNode)) return;

        var translated = getTranslatedText(val);
        if (translated !== null && translated !== val) {
            origTextMap.set(textNode, { orig: val, translated: translated });
            textNode.nodeValue = translated;
        }
    }

    function restoreTextNode(textNode) {
        if (!textNode || textNode.nodeType !== 3) return;
        var rec = origTextMap.get(textNode);
        if (rec && textNode.nodeValue === rec.translated) {
            textNode.nodeValue = rec.orig;
        }
    }

    var TARGET_ATTRS = ["placeholder", "title", "aria-label", "alt", "data-tooltip"];

    function applyOrRestoreAttr(el, key, cur, restoreMode, setter) {
        if (typeof cur !== "string" || !cur) return;
        var map = origAttrMap.get(el);
        if (restoreMode) {
            if (map && map[key] && cur === map[key].translated) {
                setter(map[key].orig);
            }
            return;
        }
        var translated = getTranslatedText(cur);
        if (translated !== null && translated !== cur) {
            if (!map) {
                map = {};
                origAttrMap.set(el, map);
            }
            map[key] = { orig: cur, translated: translated };
            setter(translated);
        }
    }

    function processElementAttributes(el, restoreMode) {
        if (!el || el.nodeType !== 1) return;
        if (EXCLUDED_TAGS[el.tagName]) return;

        for (var i = 0; i < TARGET_ATTRS.length; i++) {
            var attr = TARGET_ATTRS[i];
            if (el.hasAttribute(attr)) {
                (function (attrName) {
                    applyOrRestoreAttr(el, attrName, el.getAttribute(attrName), restoreMode, function (v) {
                        el.setAttribute(attrName, v);
                    });
                })(attr);
            }
        }
        if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit" || el.type === "reset") && el.value) {
            applyOrRestoreAttr(el, "__input_value__", el.value, restoreMode, function (v) {
                el.value = v;
            });
        }
    }

    var observedShadows = typeof WeakSet === "function" ? new WeakSet() : null;
    function observeShadow(sr) {
        if (!sr || !observer) return;
        if (observedShadows) {
            if (observedShadows.has(sr)) return;
            observedShadows.add(sr);
        }
        try {
            observer.observe(sr, { childList: true, subtree: true });
        } catch (e) {}
    }

    function walkSubtree(root, restoreMode) {
        if (!root) return;
        if (root.nodeType === 3) {
            if (restoreMode) restoreTextNode(root);
            else translateTextNode(root);
            return;
        }
        if (root.nodeType === 1 || root.nodeType === 11) {
            if (root.nodeType === 1) {
                if (!restoreMode && isInsideExcluded(root)) return;
                processElementAttributes(root, restoreMode);
                if (root.shadowRoot) {
                    if (!restoreMode) observeShadow(root.shadowRoot);
                    walkSubtree(root.shadowRoot, restoreMode);
                }
            }
            var walker = document.createTreeWalker(
                root,
                NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function (node) {
                        if (node.nodeType === 1 && isInsideExcluded(node)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        return NodeFilter.FILTER_ACCEPT;
                    }
                },
                false
            );
            var node;
            while ((node = walker.nextNode())) {
                if (node.nodeType === 3) {
                    if (restoreMode) restoreTextNode(node);
                    else translateTextNode(node);
                } else if (node.nodeType === 1) {
                    processElementAttributes(node, restoreMode);
                    if (node.shadowRoot) {
                        if (!restoreMode) observeShadow(node.shadowRoot);
                        walkSubtree(node.shadowRoot, restoreMode);
                    }
                }
            }
        }
    }

    function translateSubtree(root) {
        if (currentLang === "en") return;
        walkSubtree(root, false);
    }

    function restoreOriginalPage() {
        var target = document.body || document.documentElement;
        if (!target) return;
        isTranslating = true;
        try {
            walkSubtree(target, true);
        } finally {
            isTranslating = false;
        }
    }

    // 4. Initial Full Page Translation, Language Toggle & Lifecycle Hooks
    function translateWholePage() {
        if (currentLang === "en") return;
        var target = document.body || document.documentElement;
        if (target) {
            isTranslating = true;
            try {
                walkSubtree(target, false);
            } finally {
                isTranslating = false;
            }
        }
    }
    window.__antigravity_translateWholePage = translateWholePage;

    var toastTimer = null;
    function showToast(msg) {
        try {
            var host = document.body || document.documentElement;
            if (!host) return;
            var el = document.getElementById("__antigravity_i18n_toast__");
            if (!el) {
                el = document.createElement("div");
                el.id = "__antigravity_i18n_toast__";
                el.setAttribute("data-i18n-ignore", "true");
                el.style.cssText =
                    "position:fixed;right:20px;bottom:20px;z-index:2147483647;" +
                    "padding:8px 14px;border-radius:8px;font-size:12px;line-height:1.4;" +
                    "font-family:system-ui,-apple-system,sans-serif;pointer-events:none;" +
                    "background:rgba(24,24,27,0.92);color:#f4f4f5;" +
                    "border:1px solid rgba(255,255,255,0.14);box-shadow:0 8px 24px rgba(0,0,0,0.35);" +
                    "transition:opacity 0.2s ease;opacity:0;";
                host.appendChild(el);
            }
            el.textContent = msg;
            el.style.opacity = "1";
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(function () {
                el.style.opacity = "0";
            }, 1800);
        } catch (e) {}
    }

    var PANEL_ID = "__antigravity_i18n_lang_panel__";
    var APPEARANCE_SUBTITLES = {
        "Configure the agent's visual theme and display preferences.": true,
        "配置智能体的视觉主题与显示偏好设置。": true
    };
    var APPEARANCE_ANCHOR_GROUPS = {
        "Font Size": "font_size",
        "字体大小": "font_size",
        "Theme Mode": "theme_mode",
        "主题模式": "theme_mode",
        "Accent": "accent",
        "强调颜色": "accent",
        "Interface Layout": "layout",
        "界面布局": "layout",
        "Light Theme": "light_theme",
        "浅色主题": "light_theme",
        "Dark Theme": "dark_theme",
        "深色主题": "dark_theme",
        "Theme": "theme",
        "主题": "theme",
        "Themes": "theme"
    };
    var APPEARANCE_TITLES = {
        "Appearance": true,
        "外观": true
    };

    function findTextMatchInSubtree(root, matchMap) {
        if (!root) return null;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            if (node.nodeType === 1) {
                if (node.shadowRoot) {
                    var srMatch = findTextMatchInSubtree(node.shadowRoot, matchMap);
                    if (srMatch) return srMatch;
                }
                continue;
            }
            var parent = node.parentNode;
            if (!parent || parent.nodeType !== 1) continue;
            if (isInsideExcluded(parent)) continue;
            var txt = (node.nodeValue || "").trim();
            if (txt && matchMap[txt]) {
                return parent;
            }
        }
        return null;
    }

    function countAnchorGroups(root) {
        if (!root) return 0;
        var found = {};
        var count = 0;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            if (node.nodeType === 1) {
                if (node.shadowRoot) {
                    count += countAnchorGroups(node.shadowRoot);
                    if (count >= 2) return count;
                }
                continue;
            }
            var parent = node.parentNode;
            if (!parent || parent.nodeType !== 1 || isInsideExcluded(parent)) continue;
            var txt = (node.nodeValue || "").trim();
            var grp = txt ? APPEARANCE_ANCHOR_GROUPS[txt] : null;
            if (grp && !found[grp]) {
                found[grp] = true;
                count++;
                if (count >= 2) return count;
            }
        }
        return count;
    }

    function findAppearanceListContainer() {
        var root = document.body || document.documentElement;
        if (!root) return null;

        var subEl = findTextMatchInSubtree(root, APPEARANCE_SUBTITLES);
        var pageRoot = null;
        var anchorEl = null;

        if (subEl) {
            var curr = subEl.parentNode;
            for (var depth = 0; curr && curr !== document.documentElement && depth < 8; depth++) {
                anchorEl = findTextMatchInSubtree(curr, APPEARANCE_ANCHOR_GROUPS);
                if (anchorEl) {
                    pageRoot = curr;
                    break;
                }
                curr = curr.parentNode;
            }
        } else {
            var candAnchor = findTextMatchInSubtree(root, APPEARANCE_ANCHOR_GROUPS);
            if (candAnchor) {
                var p = candAnchor.parentNode;
                for (var d = 0; p && p !== document.documentElement && d < 7; d++) {
                    if (findTextMatchInSubtree(p, APPEARANCE_TITLES)) {
                        pageRoot = p;
                        anchorEl = candAnchor;
                        break;
                    }
                    p = p.parentNode;
                }
            }
        }

        if (!pageRoot || !anchorEl) return null;

        var row = anchorEl;
        while (row && row.parentNode && row.parentNode !== pageRoot) {
            var parent = row.parentNode;
            if (parent !== subEl && countAnchorGroups(parent) >= 2) {
                return parent;
            }
            row = parent;
        }
        return pageRoot;
    }

    var WORKBENCH_KEY = "__antigravity_workbench_cfg__";
    function loadWorkbenchCfg() {
        try {
            var raw = window.localStorage && window.localStorage.getItem(WORKBENCH_KEY);
            if (raw) {
                var p = JSON.parse(raw);
                return {
                    codeFold: p.codeFold !== false,
                    turnJump: p.turnJump !== false,
                    compactLayout: Boolean(p.compactLayout)
                };
            }
        } catch (e) {}
        return { codeFold: true, turnJump: true, compactLayout: false };
    }
    function saveWorkbenchCfg(cfg) {
        try {
            if (window.localStorage) window.localStorage.setItem(WORKBENCH_KEY, JSON.stringify(cfg));
        } catch (e) {}
    }
    var workbenchCfg = loadWorkbenchCfg();

    var COMPACT_STYLE_ID = "__ag_compact_layout_style__";
    function applyCompactLayout() {
        try {
            var existing = document.getElementById(COMPACT_STYLE_ID);
            if (!workbenchCfg.compactLayout) {
                if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                return;
            }
            if (!existing) {
                var host = document.head || document.documentElement;
                if (!host) return;
                existing = document.createElement("style");
                existing.id = COMPACT_STYLE_ID;
                existing.textContent =
                    "[data-testid='planner-response-text'],[data-testid='user-input-step'],[data-markdown-root]{line-height:1.45 !important;}\n" +
                    "[data-testid='planner-response-text'] p,[data-markdown-root] p{margin-top:0.35em !important;margin-bottom:0.35em !important;}\n" +
                    "[data-testid='planner-response-text'] ul,[data-testid='planner-response-text'] ol,[data-markdown-root] ul,[data-markdown-root] ol{margin-top:0.25em !important;margin-bottom:0.25em !important;}\n" +
                    "[data-testid='planner-response-text'] li,[data-markdown-root] li{margin-top:0.15em !important;margin-bottom:0.15em !important;}\n" +
                    "[data-testid='planner-response-text'] pre,[data-markdown-root] pre{margin-top:0.4em !important;margin-bottom:0.4em !important;}";
                host.appendChild(existing);
            }
        } catch (e) {}
    }

    var thoughtCfg = {
        mode: "off",
        viewMode: "bilingual",
        triggerMode: "expand",
        aiBaseUrl: "",
        aiModel: "",
        aiStyle: "technical",
        hasApiKey: false
    };
    var thoughtCfgLoaded = false;

    function hasThoughtBridge() {
        return Boolean(
            window.agyChineseBridge &&
            typeof window.agyChineseBridge.translateThought === "function" &&
            typeof window.agyChineseBridge.getThoughtConfig === "function"
        );
    }

    var THOUGHT_CACHE_KEY = "__antigravity_thought_cache_v1__";
    var THOUGHT_CACHE_MAX = 80;
    var thoughtMemCache = {};
    var thoughtCacheOrder = [];
    var thoughtInflight = {};
    var thoughtActiveCount = 0;
    var THOUGHT_MAX_CONCURRENT = 2;
    var thoughtQueue = [];

    function loadThoughtCache() {
        try {
            var raw = window.localStorage && window.localStorage.getItem(THOUGHT_CACHE_KEY);
            if (!raw) return;
            var obj = JSON.parse(raw);
            if (obj && typeof obj === "object") {
                for (var k in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, k) && typeof obj[k] === "string") {
                        thoughtMemCache[k] = obj[k];
                        thoughtCacheOrder.push(k);
                    }
                }
            }
        } catch (e) {}
    }
    loadThoughtCache();

    function setThoughtCacheEntry(sig, val) {
        if (!sig || typeof val !== "string") return;
        if (!Object.prototype.hasOwnProperty.call(thoughtMemCache, sig)) {
            thoughtCacheOrder.push(sig);
        }
        thoughtMemCache[sig] = val;
        while (thoughtCacheOrder.length > THOUGHT_CACHE_MAX) {
            var oldest = thoughtCacheOrder.shift();
            delete thoughtMemCache[oldest];
        }
        try {
            if (window.localStorage) {
                window.localStorage.setItem(THOUGHT_CACHE_KEY, JSON.stringify(thoughtMemCache));
            }
        } catch (e) {}
    }

    function hashString(str) {
        var h = 2166136261;
        for (var i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return h.toString(36) + "_" + str.length;
    }

    function getThoughtPanelForTrigger(trigger) {
        if (!trigger) return null;
        var ctrlId = trigger.getAttribute && trigger.getAttribute("aria-controls");
        if (ctrlId && document.getElementById) {
            var byId = document.getElementById(ctrlId);
            if (byId) return byId;
        }
        var p = trigger.parentNode;
        for (var d = 0; p && p !== document.body && d < 3; d++) {
            var children = p.children;
            if (children && children.length >= 2) {
                for (var i = 0; i < children.length; i++) {
                    var ch = children[i];
                    if (ch !== trigger && (!ch.contains || !ch.contains(trigger))) {
                        return ch;
                    }
                }
            }
            p = p.parentNode;
        }
        return null;
    }

    function extractThoughtSource(panelEl) {
        if (!panelEl) return "";
        var cloneParts = [];
        var walker = document.createTreeWalker(
            panelEl,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (n) {
                    var c = n.parentNode;
                    while (c && c !== panelEl) {
                        if (c.nodeType === 1 && c.className && typeof c.className === "string" && c.className.indexOf("__ag_thought_box__") !== -1) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        c = c.parentNode;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );
        var n;
        while ((n = walker.nextNode())) {
            var v = (n.nodeValue || "").replace(/\s+/g, " ").trim();
            if (v) cloneParts.push(v);
        }
        return cloneParts.join("\n").trim();
    }

    function setOriginalThoughtChildrenVisible(panelEl, visible) {
        if (!panelEl || !panelEl.children) return;
        for (var i = 0; i < panelEl.children.length; i++) {
            var ch = panelEl.children[i];
            if (ch.className && typeof ch.className === "string" && ch.className.indexOf("__ag_thought_box__") !== -1) {
                continue;
            }
            if (!visible) {
                if (ch.getAttribute("data-ag-orig-hidden") !== "1") {
                    ch.setAttribute("data-ag-orig-display", ch.style.display || "");
                    ch.setAttribute("data-ag-orig-hidden", "1");
                }
                ch.style.display = "none";
            } else if (ch.getAttribute("data-ag-orig-hidden") === "1") {
                ch.style.display = ch.getAttribute("data-ag-orig-display") || "";
                ch.removeAttribute("data-ag-orig-hidden");
                ch.removeAttribute("data-ag-orig-display");
            }
        }
    }

    function clearAllThoughtBoxes() {
        try {
            if (!document.querySelectorAll) return;
            var boxes = document.querySelectorAll(".__ag_thought_box__");
            for (var i = 0; i < boxes.length; i++) {
                var box = boxes[i];
                var parent = box.parentNode;
                if (parent) {
                    setOriginalThoughtChildrenVisible(parent, true);
                    parent.removeChild(box);
                }
            }
        } catch (e) {}
    }

    function renderThoughtTextBody(bodyEl, text) {
        while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
        var paras = String(text || "").split(/\n+/);
        for (var i = 0; i < paras.length; i++) {
            var line = paras[i].trim();
            if (!line) continue;
            var p = document.createElement("p");
            p.style.cssText = "margin:4px 0;line-height:1.55;font-size:12.5px;color:inherit;white-space:pre-wrap;word-break:break-word;";
            p.textContent = line;
            bodyEl.appendChild(p);
        }
    }

    function ensureThoughtBox(panelEl, sig, srcText) {
        var box = null;
        if (panelEl.children) {
            for (var i = 0; i < panelEl.children.length; i++) {
                var ch = panelEl.children[i];
                if (ch.className && typeof ch.className === "string" && ch.className.indexOf("__ag_thought_box__") !== -1) {
                    box = ch;
                    break;
                }
            }
        }
        if (!box) {
            box = document.createElement("div");
            box.className = "__ag_thought_box__";
            box.setAttribute("data-i18n-ignore", "true");
            box.style.cssText =
                "margin:6px 0 10px 0;padding:10px 12px;border-radius:8px;" +
                "border:1px solid rgba(59,130,246,0.28);background:rgba(59,130,246,0.06);";

            var bar = document.createElement("div");
            bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:11px;opacity:0.82;";

            var badge = document.createElement("span");
            badge.setAttribute("data-ag-role", "badge");
            badge.style.cssText = "font-weight:600;color:#60a5fa;";

            var actions = document.createElement("span");
            actions.style.cssText = "display:inline-flex;align-items:center;gap:8px;";

            var viewBtn = document.createElement("button");
            viewBtn.type = "button";
            viewBtn.setAttribute("data-ag-role", "view-btn");
            viewBtn.style.cssText = "background:none;border:none;padding:0;font-size:11px;cursor:pointer;color:inherit;text-decoration:underline;";
            viewBtn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                thoughtCfg.viewMode = thoughtCfg.viewMode === "immersive" ? "bilingual" : "immersive";
                if (hasThoughtBridge()) {
                    window.agyChineseBridge.saveThoughtConfig({ viewMode: thoughtCfg.viewMode });
                }
                ensureAppearancePanel();
                scanThoughtBlocks();
            });

            var rawBtn = document.createElement("button");
            rawBtn.type = "button";
            rawBtn.setAttribute("data-ag-role", "raw-btn");
            rawBtn.textContent = "原文";
            rawBtn.style.cssText = "background:none;border:none;padding:0;font-size:11px;cursor:pointer;color:inherit;text-decoration:underline;";
            rawBtn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                var nextRaw = box.getAttribute("data-ag-show-raw") !== "1";
                box.setAttribute("data-ag-show-raw", nextRaw ? "1" : "0");
                rawBtn.textContent = nextRaw ? "显示译文" : "原文";
                syncBoxVisibility(box, panelEl);
            });

            var retryBtn = document.createElement("button");
            retryBtn.type = "button";
            retryBtn.textContent = "重译";
            retryBtn.style.cssText = "background:none;border:none;padding:0;font-size:11px;cursor:pointer;color:inherit;text-decoration:underline;";
            retryBtn.addEventListener("click", function (ev) {
                ev.stopPropagation();
                var s = box.getAttribute("data-ag-sig") || "";
                if (s) delete thoughtMemCache[s];
                box.removeAttribute("data-ag-state");
                enqueueThoughtTranslation(panelEl, box, s, box.__agSrcText || srcText);
            });

            actions.appendChild(viewBtn);
            actions.appendChild(rawBtn);
            actions.appendChild(retryBtn);
            bar.appendChild(badge);
            bar.appendChild(actions);

            var body = document.createElement("div");
            body.setAttribute("data-ag-role", "body");

            box.appendChild(bar);
            box.appendChild(body);
            if (panelEl.firstChild) {
                panelEl.insertBefore(box, panelEl.firstChild);
            } else {
                panelEl.appendChild(box);
            }
        }
        box.__agSrcText = srcText;
        box.setAttribute("data-ag-sig", sig);
        var bEl = box.querySelector("[data-ag-role='badge']");
        var vEl = box.querySelector("[data-ag-role='view-btn']");
        if (bEl) bEl.textContent = thoughtCfg.mode === "ai" ? "思维译文 · AI 润色" : "思维译文 · 机翻";
        if (vEl) vEl.textContent = thoughtCfg.viewMode === "immersive" ? "切换双语" : "切换沉浸";
        return box;
    }

    function syncBoxVisibility(box, panelEl) {
        var state = box.getAttribute("data-ag-state");
        var showRaw = box.getAttribute("data-ag-show-raw") === "1";
        var bodyEl = box.querySelector("[data-ag-role='body']");
        if (bodyEl) bodyEl.style.display = showRaw ? "none" : "block";
        var shouldHideOrig = state === "done" && thoughtCfg.viewMode === "immersive" && !showRaw;
        setOriginalThoughtChildrenVisible(panelEl, !shouldHideOrig);
    }

    function pumpThoughtQueue() {
        while (thoughtActiveCount < THOUGHT_MAX_CONCURRENT && thoughtQueue.length > 0) {
            var job = thoughtQueue.shift();
            if (!job) continue;
            runThoughtJob(job);
        }
    }

    function runThoughtJob(job) {
        if (!hasThoughtBridge()) return;
        thoughtActiveCount++;
        var sig = job.sig;
        var promise = thoughtInflight[sig];
        if (!promise) {
            promise = window.agyChineseBridge.translateThought({
                text: job.srcText,
                mode: thoughtCfg.mode,
                style: thoughtCfg.aiStyle
            });
            thoughtInflight[sig] = promise;
        }
        promise.then(function (res) {
            delete thoughtInflight[sig];
            thoughtActiveCount--;
            if (res && res.ok && res.translated) {
                setThoughtCacheEntry(sig, res.translated);
                if (job.box && job.panelEl) {
                    job.box.setAttribute("data-ag-state", "done");
                    var bodyEl = job.box.querySelector("[data-ag-role='body']");
                    if (bodyEl) renderThoughtTextBody(bodyEl, res.translated);
                    syncBoxVisibility(job.box, job.panelEl);
                }
            } else if (job.box && job.panelEl) {
                job.box.setAttribute("data-ag-state", "error");
                var errEl = job.box.querySelector("[data-ag-role='body']");
                if (errEl) renderThoughtTextBody(errEl, "翻译失败: " + ((res && res.error) || "未知错误"));
                setOriginalThoughtChildrenVisible(job.panelEl, true);
            }
            pumpThoughtQueue();
        }, function (err) {
            delete thoughtInflight[sig];
            thoughtActiveCount--;
            if (job.box && job.panelEl) {
                job.box.setAttribute("data-ag-state", "error");
                var errEl = job.box.querySelector("[data-ag-role='body']");
                if (errEl) renderThoughtTextBody(errEl, "翻译异常: " + (err && err.message ? err.message : String(err)));
                setOriginalThoughtChildrenVisible(job.panelEl, true);
            }
            pumpThoughtQueue();
        });
    }

    function enqueueThoughtTranslation(panelEl, box, sig, srcText) {
        if (Object.prototype.hasOwnProperty.call(thoughtMemCache, sig)) {
            box.setAttribute("data-ag-state", "done");
            var bodyEl = box.querySelector("[data-ag-role='body']");
            if (bodyEl) renderThoughtTextBody(bodyEl, thoughtMemCache[sig]);
            syncBoxVisibility(box, panelEl);
            return;
        }
        if (box.getAttribute("data-ag-state") === "pending") return;
        box.setAttribute("data-ag-state", "pending");
        var b = box.querySelector("[data-ag-role='body']");
        if (b) renderThoughtTextBody(b, thoughtCfg.mode === "ai" ? "正在 AI 润色翻译思考过程..." : "正在翻译思考过程...");
        setOriginalThoughtChildrenVisible(panelEl, true);
        thoughtQueue.push({ panelEl: panelEl, box: box, sig: sig, srcText: srcText });
        pumpThoughtQueue();
    }

    function scanThoughtBlocks() {
        if (currentLang === "en" || thoughtCfg.mode === "off" || !hasThoughtBridge()) {
            clearAllThoughtBoxes();
            return;
        }
        try {
            if (!document.querySelectorAll) return;
            var triggers = document.querySelectorAll('button[data-testid="thinking-collapsible-trigger"]');
            for (var i = 0; i < triggers.length; i++) {
                var trg = triggers[i];
                var expanded = trg.getAttribute("aria-expanded") === "true";
                if (thoughtCfg.triggerMode === "expand" && !expanded) continue;
                var panelEl = getThoughtPanelForTrigger(trg);
                if (!panelEl) continue;
                var srcText = extractThoughtSource(panelEl);
                if (!srcText || !/[A-Za-z]{4,}/.test(srcText)) continue;
                var sig = hashString(thoughtCfg.mode + ":" + thoughtCfg.aiStyle + ":" + srcText);
                var box = ensureThoughtBox(panelEl, sig, srcText);
                if (box.getAttribute("data-ag-state") === "done" && box.getAttribute("data-ag-sig") === sig) {
                    syncBoxVisibility(box, panelEl);
                    continue;
                }
                enqueueThoughtTranslation(panelEl, box, sig, srcText);
            }
        } catch (e) {}
    }

    function enhanceCodeBlocks() {
        if (!workbenchCfg.codeFold) return;
        try {
            if (!document.querySelectorAll) return;
            var pres = document.querySelectorAll("pre");
            for (var i = 0; i < pres.length; i++) {
                var pre = pres[i];
                if (isInsideEditorOrOwnUi(pre.parentNode)) continue;
                var text = pre.textContent || "";
                var lineCount = text.split("\n").length;
                if (lineCount < 48) continue;
                var btn = pre.querySelector ? pre.querySelector(".__ag_code_fold_btn__") : null;
                if (!btn) {
                    if (!pre.style.position) pre.style.position = "relative";
                    btn = document.createElement("button");
                    btn.type = "button";
                    btn.className = "__ag_code_fold_btn__";
                    btn.setAttribute("data-i18n-ignore", "true");
                    btn.style.cssText =
                        "position:absolute;top:6px;right:8px;z-index:10;padding:2px 8px;border-radius:6px;" +
                        "font-size:11px;line-height:1.4;cursor:pointer;border:1px solid rgba(128,128,128,0.35);" +
                        "background:rgba(24,24,27,0.82);color:#e4e4e7;";
                    (function (preNode, foldBtn, lines) {
                        foldBtn.addEventListener("click", function (ev) {
                            ev.stopPropagation();
                            var isFolded = preNode.getAttribute("data-ag-folded") === "1";
                            if (isFolded) {
                                preNode.setAttribute("data-ag-folded", "0");
                                preNode.style.maxHeight = "";
                                preNode.style.overflow = "";
                                foldBtn.textContent = "折叠 (" + lines + "行)";
                            } else {
                                preNode.setAttribute("data-ag-folded", "1");
                                preNode.style.maxHeight = "260px";
                                preNode.style.overflow = "hidden";
                                foldBtn.textContent = "展开 (" + lines + "行)";
                            }
                        });
                    })(pre, btn, lineCount);
                    pre.appendChild(btn);
                }
                var folded = pre.getAttribute("data-ag-folded") === "1";
                btn.textContent = (folded ? "展开 (" : "折叠 (") + lineCount + "行)";
            }
        } catch (e) {}
    }

    function jumpConversationTurn(direction) {
        if (!workbenchCfg.turnJump || !document.querySelectorAll) return false;
        var turns = document.querySelectorAll('[data-testid="conversation-navigator-turn"]');
        if (!turns || turns.length === 0) return false;
        var list = [];
        for (var i = 0; i < turns.length; i++) {
            var r = turns[i].getBoundingClientRect ? turns[i].getBoundingClientRect() : null;
            if (r && (r.height > 0 || r.width > 0)) list.push({ el: turns[i], top: r.top });
        }
        if (list.length === 0) return false;
        var targetIdx = 0;
        if (direction < 0) {
            targetIdx = 0;
            for (var j = list.length - 1; j >= 0; j--) {
                if (list[j].top < -12) { targetIdx = j; break; }
            }
        } else {
            targetIdx = list.length - 1;
            for (var k = 0; k < list.length; k++) {
                if (list[k].top > 24) { targetIdx = k; break; }
            }
        }
        if (typeof list[targetIdx].el.scrollIntoView === "function") {
            list[targetIdx].el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        showToast("对话轮次: " + (targetIdx + 1) + " / " + list.length);
        return true;
    }

    function initThoughtConfigFromBridge() {
        if (!hasThoughtBridge() || thoughtCfgLoaded) return;
        thoughtCfgLoaded = true;
        window.agyChineseBridge.getThoughtConfig().then(function (cfg) {
            if (cfg && typeof cfg === "object") {
                thoughtCfg = cfg;
                ensureAppearancePanel();
                scanThoughtBlocks();
            }
        }).catch(function () {});
    }

    function updateAppearancePanelState(panel) {
        if (!panel) return;
        var isEn = currentLang === "en";
        var titleEl = panel.querySelector ? panel.querySelector("[data-i18n-role='title']") : panel.__i18nTitleEl;
        var descEl = panel.querySelector ? panel.querySelector("[data-i18n-role='desc']") : panel.__i18nDescEl;
        var zhBtn = panel.querySelector ? panel.querySelector("[data-i18n-lang='zh-CN']") : panel.__i18nZhBtn;
        var enBtn = panel.querySelector ? panel.querySelector("[data-i18n-lang='en']") : panel.__i18nEnBtn;

        if (titleEl) titleEl.textContent = isEn ? "Display Language" : "界面语言";
        if (descEl) {
            descEl.textContent = isEn
                ? "Switch interface language instantly without restarting (Alt+Shift+L)"
                : "即时切换界面显示语言，无需重启（快捷键 Alt+Shift+L）";
        }
        var activeStyle = "padding:5px 12px;border-radius:6px;border:none;font-size:12px;font-weight:600;cursor:pointer;background:#3b82f6;color:#ffffff;transition:all 0.15s ease;";
        var idleStyle = "padding:5px 12px;border-radius:6px;border:none;font-size:12px;font-weight:500;cursor:pointer;background:transparent;color:inherit;opacity:0.78;transition:all 0.15s ease;";
        if (zhBtn) {
            zhBtn.style.cssText = isEn ? idleStyle : activeStyle;
            zhBtn.setAttribute("aria-pressed", isEn ? "false" : "true");
        }
        if (enBtn) {
            enBtn.style.cssText = isEn ? activeStyle : idleStyle;
            enBtn.setAttribute("aria-pressed", isEn ? "true" : "false");
        }

        // Thought & Workbench controls inside the same card
        var bridgeOk = hasThoughtBridge();
        if (panel.__i18nModeBtns) {
            for (var mKey in panel.__i18nModeBtns) {
                var mb = panel.__i18nModeBtns[mKey];
                mb.disabled = !bridgeOk;
                mb.style.cssText = (thoughtCfg.mode === mKey ? activeStyle : idleStyle) + (bridgeOk ? "" : "opacity:0.45;cursor:not-allowed;");
            }
        }
        if (panel.__i18nViewBtns) {
            for (var vKey in panel.__i18nViewBtns) {
                panel.__i18nViewBtns[vKey].style.cssText = thoughtCfg.viewMode === vKey ? activeStyle : idleStyle;
            }
        }
        if (panel.__i18nTrigBtns) {
            for (var tKey in panel.__i18nTrigBtns) {
                panel.__i18nTrigBtns[tKey].style.cssText = thoughtCfg.triggerMode === tKey ? activeStyle : idleStyle;
            }
        }
        if (panel.__i18nThoughtSubRow) {
            panel.__i18nThoughtSubRow.style.display = bridgeOk && thoughtCfg.mode !== "off" ? "flex" : "none";
        }
        if (panel.__i18nBridgeHint) {
            panel.__i18nBridgeHint.style.display = bridgeOk ? "none" : "block";
        }
        if (panel.__i18nAiBox) {
            panel.__i18nAiBox.style.display = bridgeOk && thoughtCfg.mode === "ai" ? "block" : "none";
        }
        if (panel.__i18nAiUrl && document.activeElement !== panel.__i18nAiUrl) {
            panel.__i18nAiUrl.value = thoughtCfg.aiBaseUrl || "";
        }
        if (panel.__i18nAiModel && document.activeElement !== panel.__i18nAiModel) {
            panel.__i18nAiModel.value = thoughtCfg.aiModel || "";
        }
        if (panel.__i18nAiStyle && document.activeElement !== panel.__i18nAiStyle) {
            panel.__i18nAiStyle.value = thoughtCfg.aiStyle || "technical";
        }
        if (panel.__i18nAiKey && document.activeElement !== panel.__i18nAiKey && !panel.__i18nAiKey.value && thoughtCfg.hasApiKey) {
            panel.__i18nAiKey.placeholder = "已保存密钥 (留空保持不变)";
        }
        if (panel.__i18nFoldChk) panel.__i18nFoldChk.checked = Boolean(workbenchCfg.codeFold);
        if (panel.__i18nJumpChk) panel.__i18nJumpChk.checked = Boolean(workbenchCfg.turnJump);
        if (panel.__i18nCompactChk) panel.__i18nCompactChk.checked = Boolean(workbenchCfg.compactLayout);
    }

    function makePillGroup() {
        var pill = document.createElement("div");
        pill.style.cssText =
            "display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:8px;" +
            "border:1px solid rgba(128,128,128,0.24);background:rgba(128,128,128,0.08);flex-shrink:0;";
        return pill;
    }

    function buildAppearancePanel() {
        var panel = document.createElement("div");
        panel.id = PANEL_ID;
        panel.setAttribute("data-i18n-ignore", "true");
        panel.style.cssText =
            "display:flex;flex-direction:column;gap:12px;" +
            "padding:14px 16px;margin-top:12px;border-radius:10px;" +
            "border:1px solid rgba(128,128,128,0.22);background:rgba(128,128,128,0.06);";

        // Row 1: Display Language
        var langRow = document.createElement("div");
        langRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px;";

        var left = document.createElement("div");
        left.style.cssText = "min-width:0;flex:1;";

        var title = document.createElement("div");
        title.setAttribute("data-i18n-role", "title");
        title.style.cssText = "font-size:13px;font-weight:600;line-height:1.4;color:inherit;";

        var desc = document.createElement("div");
        desc.setAttribute("data-i18n-role", "desc");
        desc.style.cssText = "font-size:12px;line-height:1.4;opacity:0.72;margin-top:2px;color:inherit;";

        left.appendChild(title);
        left.appendChild(desc);

        var pill = makePillGroup();
        var zhBtn = document.createElement("button");
        zhBtn.type = "button";
        zhBtn.setAttribute("data-i18n-lang", "zh-CN");
        zhBtn.textContent = "简体中文";
        zhBtn.addEventListener("click", function () { window.__antigravity_setLang("zh-CN"); });

        var enBtn = document.createElement("button");
        enBtn.type = "button";
        enBtn.setAttribute("data-i18n-lang", "en");
        enBtn.textContent = "English";
        enBtn.addEventListener("click", function () { window.__antigravity_setLang("en"); });

        pill.appendChild(zhBtn);
        pill.appendChild(enBtn);
        langRow.appendChild(left);
        langRow.appendChild(pill);
        panel.appendChild(langRow);

        // Row 2: Thought Translator (Dual-Mode)
        var thoughtSection = document.createElement("div");
        thoughtSection.style.cssText = "border-top:1px solid rgba(128,128,128,0.16);padding-top:12px;display:flex;flex-direction:column;gap:10px;";

        var tRow = document.createElement("div");
        tRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:16px;";

        var tLeft = document.createElement("div");
        tLeft.style.cssText = "min-width:0;flex:1;";
        var tTitle = document.createElement("div");
        tTitle.textContent = "思考过程双模翻译 (Beta)";
        tTitle.style.cssText = "font-size:13px;font-weight:600;line-height:1.4;color:inherit;";
        var tDesc = document.createElement("div");
        tDesc.textContent = "零后台常驻进程，支持免配置机翻与本地/兼容 AI 流式润色";
        tDesc.style.cssText = "font-size:12px;line-height:1.4;opacity:0.72;margin-top:2px;color:inherit;";
        tLeft.appendChild(tTitle);
        tLeft.appendChild(tDesc);

        var modePill = makePillGroup();
        var modeBtns = {};
        var modes = [["off", "关闭"], ["machine", "机翻"], ["ai", "AI 润色"]];
        for (var i = 0; i < modes.length; i++) {
            (function (mKey, mLabel) {
                var b = document.createElement("button");
                b.type = "button";
                b.textContent = mLabel;
                b.addEventListener("click", function () {
                    if (!hasThoughtBridge()) return;
                    thoughtCfg.mode = mKey;
                    window.agyChineseBridge.saveThoughtConfig({ mode: mKey }).then(function (res) {
                        if (res && res.config) thoughtCfg = res.config;
                        updateAppearancePanelState(panel);
                        scanThoughtBlocks();
                    });
                });
                modeBtns[mKey] = b;
                modePill.appendChild(b);
            })(modes[i][0], modes[i][1]);
        }
        tRow.appendChild(tLeft);
        tRow.appendChild(modePill);
        thoughtSection.appendChild(tRow);

        var bridgeHint = document.createElement("div");
        bridgeHint.textContent = "提示：请重新运行一次 一键汉化.bat 并重开客户端，以注入主进程思考翻译 IPC 桥接。";
        bridgeHint.style.cssText = "font-size:11.5px;color:#f59e0b;display:none;";
        thoughtSection.appendChild(bridgeHint);

        var subRow = document.createElement("div");
        subRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;";

        var viewPill = makePillGroup();
        var viewBtns = {};
        var views = [["bilingual", "双语对照"], ["immersive", "沉浸中文"]];
        for (var vi = 0; vi < views.length; vi++) {
            (function (vKey, vLabel) {
                var b = document.createElement("button");
                b.type = "button";
                b.textContent = vLabel;
                b.addEventListener("click", function () {
                    thoughtCfg.viewMode = vKey;
                    if (hasThoughtBridge()) window.agyChineseBridge.saveThoughtConfig({ viewMode: vKey });
                    updateAppearancePanelState(panel);
                    scanThoughtBlocks();
                });
                viewBtns[vKey] = b;
                viewPill.appendChild(b);
            })(views[vi][0], views[vi][1]);
        }

        var trigPill = makePillGroup();
        var trigBtns = {};
        var trigs = [["expand", "展开时翻译 (省流)"], ["auto", "自动翻译"]];
        for (var ti = 0; ti < trigs.length; ti++) {
            (function (tKey, tLabel) {
                var b = document.createElement("button");
                b.type = "button";
                b.textContent = tLabel;
                b.addEventListener("click", function () {
                    thoughtCfg.triggerMode = tKey;
                    if (hasThoughtBridge()) window.agyChineseBridge.saveThoughtConfig({ triggerMode: tKey });
                    updateAppearancePanelState(panel);
                    scanThoughtBlocks();
                });
                trigBtns[tKey] = b;
                trigPill.appendChild(b);
            })(trigs[ti][0], trigs[ti][1]);
        }
        subRow.appendChild(viewPill);
        subRow.appendChild(trigPill);
        thoughtSection.appendChild(subRow);

        // AI Config Box
        var aiBox = document.createElement("div");
        aiBox.style.cssText = "display:none;padding:10px 12px;border-radius:8px;border:1px solid rgba(128,128,128,0.2);background:rgba(128,128,128,0.05);";

        var inputStyle = "width:100%;box-sizing:border-box;padding:6px 8px;border-radius:6px;border:1px solid rgba(128,128,128,0.28);background:transparent;color:inherit;font-size:12px;";
        var grid = document.createElement("div");
        grid.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:8px;";

        var aiUrl = document.createElement("input");
        aiUrl.type = "text";
        aiUrl.placeholder = "Base URL (如 http://127.0.0.1:11434/v1)";
        aiUrl.style.cssText = inputStyle;

        var aiModel = document.createElement("input");
        aiModel.type = "text";
        aiModel.placeholder = "Model (如 qwen2.5:7b / deepseek-chat)";
        aiModel.style.cssText = inputStyle;

        var aiKey = document.createElement("input");
        aiKey.type = "password";
        aiKey.placeholder = "API Key (本地 Ollama 可留空)";
        aiKey.style.cssText = inputStyle;

        var aiStyle = document.createElement("select");
        aiStyle.style.cssText = inputStyle;
        var optTech = document.createElement("option");
        optTech.value = "technical";
        optTech.textContent = "工程精细还原";
        var optCon = document.createElement("option");
        optCon.value = "concise";
        optCon.textContent = "简明要点摘要";
        aiStyle.appendChild(optTech);
        aiStyle.appendChild(optCon);

        grid.appendChild(aiUrl);
        grid.appendChild(aiModel);
        grid.appendChild(aiKey);
        grid.appendChild(aiStyle);
        aiBox.appendChild(grid);

        var aiFoot = document.createElement("div");
        aiFoot.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;";
        var aiStatus = document.createElement("span");
        aiStatus.style.cssText = "font-size:11.5px;opacity:0.8;color:inherit;";
        var saveTestBtn = document.createElement("button");
        saveTestBtn.type = "button";
        saveTestBtn.textContent = "保存并测试连接";
        saveTestBtn.style.cssText = "padding:5px 12px;border-radius:6px;border:none;font-size:12px;font-weight:600;cursor:pointer;background:#3b82f6;color:#ffffff;flex-shrink:0;";
        saveTestBtn.addEventListener("click", function () {
            if (!hasThoughtBridge()) return;
            aiStatus.textContent = "正在测试连接...";
            var payload = {
                mode: "ai",
                aiBaseUrl: aiUrl.value.trim(),
                aiModel: aiModel.value.trim(),
                aiStyle: aiStyle.value
            };
            if (aiKey.value.trim()) {
                payload.aiApiKey = aiKey.value.trim();
            } else if (thoughtCfg.hasApiKey) {
                payload.aiApiKey = "__KEEP__";
            }
            window.agyChineseBridge.testThoughtConfig(payload).then(function (res) {
                if (res && res.config) thoughtCfg = res.config;
                aiKey.value = "";
                updateAppearancePanelState(panel);
                if (res && res.ok) {
                    aiStatus.textContent = "连接成功 (" + res.latencyMs + "ms): " + String(res.sample || "").slice(0, 36);
                    scanThoughtBlocks();
                } else {
                    aiStatus.textContent = "测试失败: " + ((res && res.error) || "未知错误");
                }
            }).catch(function (err) {
                aiStatus.textContent = "测试异常: " + (err && err.message ? err.message : String(err));
            });
        });
        aiFoot.appendChild(aiStatus);
        aiFoot.appendChild(saveTestBtn);
        aiBox.appendChild(aiFoot);
        thoughtSection.appendChild(aiBox);
        panel.appendChild(thoughtSection);

        // Row 3: Lightweight Workbench Controls
        var wbRow = document.createElement("div");
        wbRow.style.cssText = "border-top:1px solid rgba(128,128,128,0.16);padding-top:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:12px;";

        var foldWrap = document.createElement("label");
        foldWrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;cursor:pointer;";
        var foldChk = document.createElement("input");
        foldChk.type = "checkbox";
        foldChk.addEventListener("change", function () {
            workbenchCfg.codeFold = Boolean(foldChk.checked);
            saveWorkbenchCfg(workbenchCfg);
            if (workbenchCfg.codeFold) enhanceCodeBlocks();
        });
        foldWrap.appendChild(foldChk);
        foldWrap.appendChild(document.createTextNode("长代码块手动折叠 (≥48行)"));

        var jumpWrap = document.createElement("label");
        jumpWrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;cursor:pointer;";
        var jumpChk = document.createElement("input");
        jumpChk.type = "checkbox";
        jumpChk.addEventListener("change", function () {
            workbenchCfg.turnJump = Boolean(jumpChk.checked);
            saveWorkbenchCfg(workbenchCfg);
        });
        jumpWrap.appendChild(jumpChk);
        jumpWrap.appendChild(document.createTextNode("Alt+↑/↓ 轮次快速跳转"));

        var compactWrap = document.createElement("label");
        compactWrap.style.cssText = "display:inline-flex;align-items:center;gap:6px;cursor:pointer;";
        var compactChk = document.createElement("input");
        compactChk.type = "checkbox";
        compactChk.addEventListener("change", function () {
            workbenchCfg.compactLayout = Boolean(compactChk.checked);
            saveWorkbenchCfg(workbenchCfg);
            applyCompactLayout();
        });
        compactWrap.appendChild(compactChk);
        compactWrap.appendChild(document.createTextNode("紧凑排版 (收紧行高与间距)"));

        wbRow.appendChild(foldWrap);
        wbRow.appendChild(jumpWrap);
        wbRow.appendChild(compactWrap);
        panel.appendChild(wbRow);

        panel.__i18nTitleEl = title;
        panel.__i18nDescEl = desc;
        panel.__i18nZhBtn = zhBtn;
        panel.__i18nEnBtn = enBtn;
        panel.__i18nModeBtns = modeBtns;
        panel.__i18nViewBtns = viewBtns;
        panel.__i18nTrigBtns = trigBtns;
        panel.__i18nThoughtSubRow = subRow;
        panel.__i18nBridgeHint = bridgeHint;
        panel.__i18nAiBox = aiBox;
        panel.__i18nAiUrl = aiUrl;
        panel.__i18nAiModel = aiModel;
        panel.__i18nAiKey = aiKey;
        panel.__i18nAiStyle = aiStyle;
        panel.__i18nFoldChk = foldChk;
        panel.__i18nJumpChk = jumpChk;
        panel.__i18nCompactChk = compactChk;
        updateAppearancePanelState(panel);
        return panel;
    }

    function ensureAppearancePanel() {
        try {
            var container = findAppearanceListContainer();
            var existing = document.getElementById(PANEL_ID);
            if (!container) {
                if (existing && existing.parentNode) {
                    existing.parentNode.removeChild(existing);
                }
                return;
            }
            if (!existing) {
                existing = buildAppearancePanel();
            } else {
                updateAppearancePanelState(existing);
            }
            if (existing.parentNode !== container) {
                container.appendChild(existing);
            }
        } catch (e) {}
    }

    var appearanceSyncTimer = null;
    function scheduleAppearancePanelSync() {
        if (appearanceSyncTimer) clearTimeout(appearanceSyncTimer);
        appearanceSyncTimer = setTimeout(function () {
            appearanceSyncTimer = null;
            ensureAppearancePanel();
            enhanceCodeBlocks();
            scanThoughtBlocks();
        }, 120);
    }

    function applyLang(nextLang, showNotice) {
        var targetLang = nextLang === "en" ? "en" : "zh-CN";
        if (targetLang === currentLang) return;
        currentLang = targetLang;
        saveLang(currentLang);
        if (currentLang === "en") {
            restoreOriginalPage();
            clearAllThoughtBoxes();
            if (showNotice) showToast("Interface Language: English (Original)");
        } else {
            translateWholePage();
            scanThoughtBlocks();
            if (showNotice) showToast("界面语言：简体中文 (Alt+Shift+L 切换)");
        }
        ensureAppearancePanel();
    }

    window.__antigravity_getLang = function () { return currentLang; };
    window.__antigravity_setLang = function (lang) { applyLang(lang, true); };
    window.__antigravity_toggleLang = function () {
        applyLang(currentLang === "en" ? "zh-CN" : "en", true);
    };

    var onStorage = function (ev) {
        if (ev && ev.key === STORAGE_KEY && (ev.newValue === "en" || ev.newValue === "zh-CN")) {
            applyLang(ev.newValue, false);
        }
    };
    window.addEventListener("storage", onStorage);

    var onKeyDown = function (ev) {
        if (!ev || ev.isComposing || isComposing) return;
        if (ev.altKey && ev.shiftKey && !ev.ctrlKey && !ev.metaKey &&
            (ev.key === "L" || ev.key === "l" || ev.code === "KeyL")) {
            ev.preventDefault();
            window.__antigravity_toggleLang();
            return;
        }
        if (ev.altKey && !ev.ctrlKey && !ev.shiftKey && !ev.metaKey &&
            (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
            var active = document.activeElement;
            if (active && (
                active.tagName === "INPUT" ||
                active.tagName === "TEXTAREA" ||
                active.tagName === "SELECT" ||
                active.isContentEditable ||
                isInsideExcluded(active)
            )) {
                return;
            }
            if (jumpConversationTurn(ev.key === "ArrowUp" ? -1 : 1)) {
                ev.preventDefault();
            }
        }
    };
    window.addEventListener("keydown", onKeyDown, true);

    window.__antigravity_ensureAppearancePanel = ensureAppearancePanel;
    initThoughtConfigFromBridge();
    applyCompactLayout();

    if (currentLang !== "en") {
        translateWholePage();
    }
    ensureAppearancePanel();
    enhanceCodeBlocks();
    scanThoughtBlocks();

    var onDomReady = function () {
        initThoughtConfigFromBridge();
        applyCompactLayout();
        translateWholePage();
        ensureAppearancePanel();
        enhanceCodeBlocks();
        scanThoughtBlocks();
    };
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", onDomReady);
    }
    window.addEventListener("load", onDomReady);

    var onPopOrHash = function () {
        setTimeout(onDomReady, 50);
    };
    window.addEventListener("popstate", onPopOrHash);
    window.addEventListener("hashchange", onPopOrHash);

    // Multi-turn progressive scans for React initial async rendering
    var scanDelays = [100, 250, 500, 1000, 1800, 3000, 5000];
    for (var k = 0; k < scanDelays.length; k++) {
        setTimeout(onDomReady, scanDelays[k]);
    }

    // 5. High-Performance MutationObserver (observes childList on documentElement)
    var isTranslating = false;
    var observer = new MutationObserver(function (mutations) {
        if (isTranslating) return;
        scheduleAppearancePanelSync();
        if (currentLang === "en") return;
        isTranslating = true;
        try {
            for (var i = 0; i < mutations.length; i++) {
                var m = mutations[i];
                if (m.type === "childList") {
                    for (var j = 0; j < m.addedNodes.length; j++) {
                        translateSubtree(m.addedNodes[j]);
                    }
                }
            }
        } finally {
            isTranslating = false;
        }
    });

    function startObserving() {
        var root = document.documentElement || document.body;
        if (root) {
            observer.observe(root, {
                childList: true,
                subtree: true
            });
        } else {
            setTimeout(startObserving, 30);
        }
    }
    startObserving();

    // Debounced interaction re-scan for in-place React text updates (avoids characterData loop)
    // Skip scans during IME composition to prevent Windows candidate window flicker.
    var isComposing = false;
    var onCompStart = function () { isComposing = true; };
    var onCompEnd = function () {
        isComposing = false;
        scheduleInteractionScan();
    };
    window.addEventListener("compositionstart", onCompStart, true);
    window.addEventListener("compositionend", onCompEnd, true);

    var interactionTimer = null;
    function scheduleInteractionScan(ev) {
        if (isComposing || (ev && ev.isComposing)) return;
        scheduleAppearancePanelSync();
        if (currentLang === "en") return;
        if (interactionTimer) clearTimeout(interactionTimer);
        interactionTimer = setTimeout(function () {
            interactionTimer = null;
            if (!isTranslating && !isComposing && currentLang !== "en") {
                translateWholePage();
            }
        }, 80);
    }
    var INTERACTION_EVENTS = ["click", "contextmenu", "mousedown", "change", "keyup", "focusin"];
    for (var evIdx = 0; evIdx < INTERACTION_EVENTS.length; evIdx++) {
        window.addEventListener(INTERACTION_EVENTS[evIdx], scheduleInteractionScan, true);
    }

    window.__antigravity_runner_cleanup = function () {
        try { observer.disconnect(); } catch (e) {}
        if (interactionTimer) clearTimeout(interactionTimer);
        if (appearanceSyncTimer) clearTimeout(appearanceSyncTimer);
        if (toastTimer) clearTimeout(toastTimer);
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("keydown", onKeyDown, true);
        window.removeEventListener("compositionstart", onCompStart, true);
        window.removeEventListener("compositionend", onCompEnd, true);
        window.removeEventListener("load", onDomReady);
        window.removeEventListener("popstate", onPopOrHash);
        window.removeEventListener("hashchange", onPopOrHash);
        for (var i = 0; i < INTERACTION_EVENTS.length; i++) {
            window.removeEventListener(INTERACTION_EVENTS[i], scheduleInteractionScan, true);
        }
        var oldPanel = document.getElementById(PANEL_ID);
        if (oldPanel && oldPanel.parentNode) oldPanel.parentNode.removeChild(oldPanel);
        var oldStyle = document.getElementById(COMPACT_STYLE_ID);
        if (oldStyle && oldStyle.parentNode) oldStyle.parentNode.removeChild(oldStyle);
        clearAllThoughtBoxes();
    };

    console.log("[Antigravity i18n] Localization runner v" + RUNNER_VERSION + " initialized (lang=" + currentLang + ").");
})();
