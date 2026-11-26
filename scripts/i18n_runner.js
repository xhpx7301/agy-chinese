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

    if (window.__antigravity_i18n_runner_active) {
        if (typeof window.__antigravity_translateWholePage === "function" &&
            (typeof window.__antigravity_getLang !== "function" || window.__antigravity_getLang() !== "en")) {
            window.__antigravity_translateWholePage();
        }
        return;
    }
    window.__antigravity_i18n_runner_active = true;

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
        "view-lines",
        "xterm",
        "cm-editor",
        "CodeMirror",
        "hljs",
        "shiki",
        "token",
        "syntax"
    ];

    function isInsideExcluded(node) {
        var curr = node;
        while (curr && curr !== document.body && curr !== document.documentElement) {
            if (curr.nodeType === 1) {
                if (curr.id === "__antigravity_i18n_toast__") return true;
                var tag = curr.tagName;
                if (EXCLUDED_TAGS[tag]) return true;
                if (curr.isContentEditable) return true;
                if (curr.getAttribute) {
                    if (curr.getAttribute("data-i18n-ignore") === "true") return true;
                    var role = curr.getAttribute("role");
                    if (role === "textbox" || role === "code") return true;
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
    var APPEARANCE_ANCHORS = {
        "Font Size": true,
        "字体大小": true,
        "Theme Mode": true,
        "主题模式": true,
        "Accent": true,
        "强调颜色": true,
        "Interface Layout": true,
        "界面布局": true,
        "Light Theme": true,
        "浅色主题": true,
        "Theme": true,
        "主题": true
    };
    var APPEARANCE_TITLES = {
        "Appearance": true,
        "外观": true
    };

    function findTextMatchInSubtree(root, matchMap) {
        if (!root) return null;
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
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

    function findAppearanceListContainer() {
        var root = document.body || document.documentElement;
        if (!root) return null;

        var subEl = findTextMatchInSubtree(root, APPEARANCE_SUBTITLES);
        var pageRoot = null;
        var anchorEl = null;

        if (subEl) {
            var curr = subEl.parentNode;
            for (var depth = 0; curr && curr !== document.documentElement && depth < 7; depth++) {
                anchorEl = findTextMatchInSubtree(curr, APPEARANCE_ANCHORS);
                if (anchorEl) {
                    pageRoot = curr;
                    break;
                }
                curr = curr.parentNode;
            }
        } else {
            var candAnchor = findTextMatchInSubtree(root, APPEARANCE_ANCHORS);
            if (candAnchor) {
                var p = candAnchor.parentNode;
                for (var d = 0; p && p !== document.documentElement && d < 6; d++) {
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
            var childCount = parent.children ? parent.children.length : (parent.childNodes ? parent.childNodes.length : 0);
            if (childCount >= 2 && parent !== subEl) {
                return parent;
            }
            row = parent;
        }
        return pageRoot;
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
    }

    function buildAppearancePanel() {
        var panel = document.createElement("div");
        panel.id = PANEL_ID;
        panel.setAttribute("data-i18n-ignore", "true");
        panel.style.cssText =
            "display:flex;align-items:center;justify-content:space-between;gap:16px;" +
            "padding:14px 16px;margin-top:12px;border-radius:10px;" +
            "border:1px solid rgba(128,128,128,0.22);background:rgba(128,128,128,0.06);";

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

        var pill = document.createElement("div");
        pill.style.cssText =
            "display:inline-flex;align-items:center;gap:2px;padding:3px;border-radius:8px;" +
            "border:1px solid rgba(128,128,128,0.24);background:rgba(128,128,128,0.08);flex-shrink:0;";

        var zhBtn = document.createElement("button");
        zhBtn.type = "button";
        zhBtn.setAttribute("data-i18n-lang", "zh-CN");
        zhBtn.textContent = "简体中文";
        zhBtn.addEventListener("click", function () {
            window.__antigravity_setLang("zh-CN");
        });

        var enBtn = document.createElement("button");
        enBtn.type = "button";
        enBtn.setAttribute("data-i18n-lang", "en");
        enBtn.textContent = "English";
        enBtn.addEventListener("click", function () {
            window.__antigravity_setLang("en");
        });

        pill.appendChild(zhBtn);
        pill.appendChild(enBtn);
        panel.appendChild(left);
        panel.appendChild(pill);

        panel.__i18nTitleEl = title;
        panel.__i18nDescEl = desc;
        panel.__i18nZhBtn = zhBtn;
        panel.__i18nEnBtn = enBtn;
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
        }, 40);
    }

    function applyLang(nextLang, showNotice) {
        var targetLang = nextLang === "en" ? "en" : "zh-CN";
        if (targetLang === currentLang) return;
        currentLang = targetLang;
        saveLang(currentLang);
        if (currentLang === "en") {
            restoreOriginalPage();
            if (showNotice) showToast("Interface Language: English (Original)");
        } else {
            translateWholePage();
            if (showNotice) showToast("界面语言：简体中文 (Alt+Shift+L 切换)");
        }
        ensureAppearancePanel();
    }

    window.__antigravity_getLang = function () { return currentLang; };
    window.__antigravity_setLang = function (lang) { applyLang(lang, true); };
    window.__antigravity_toggleLang = function () {
        applyLang(currentLang === "en" ? "zh-CN" : "en", true);
    };

    window.addEventListener("storage", function (ev) {
        if (ev && ev.key === STORAGE_KEY && (ev.newValue === "en" || ev.newValue === "zh-CN")) {
            applyLang(ev.newValue, false);
        }
    });

    window.addEventListener("keydown", function (ev) {
        if (ev && ev.altKey && ev.shiftKey && !ev.ctrlKey && !ev.metaKey &&
            (ev.key === "L" || ev.key === "l" || ev.code === "KeyL")) {
            ev.preventDefault();
            window.__antigravity_toggleLang();
        }
    }, true);

    if (currentLang !== "en") {
        translateWholePage();
    }
    ensureAppearancePanel();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            translateWholePage();
            ensureAppearancePanel();
        });
    }
    window.addEventListener("load", function () {
        translateWholePage();
        ensureAppearancePanel();
    });

    // SPA client-side routing triggers
    window.addEventListener("popstate", function () {
        setTimeout(function () {
            translateWholePage();
            ensureAppearancePanel();
        }, 50);
    });
    window.addEventListener("hashchange", function () {
        setTimeout(function () {
            translateWholePage();
            ensureAppearancePanel();
        }, 50);
    });

    // Multi-turn progressive scans for React initial async rendering
    var scanDelays = [100, 250, 500, 1000, 1800, 3000, 5000];
    for (var k = 0; k < scanDelays.length; k++) {
        setTimeout(function () {
            translateWholePage();
            ensureAppearancePanel();
        }, scanDelays[k]);
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
    var interactionTimer = null;
    function scheduleInteractionScan() {
        scheduleAppearancePanelSync();
        if (currentLang === "en") return;
        if (interactionTimer) clearTimeout(interactionTimer);
        interactionTimer = setTimeout(function () {
            interactionTimer = null;
            if (!isTranslating && currentLang !== "en") {
                translateWholePage();
            }
        }, 80);
    }
    window.addEventListener("click", scheduleInteractionScan, true);
    window.addEventListener("contextmenu", scheduleInteractionScan, true);
    window.addEventListener("mousedown", scheduleInteractionScan, true);
    window.addEventListener("change", scheduleInteractionScan, true);
    window.addEventListener("keyup", scheduleInteractionScan, true);
    window.addEventListener("focusin", scheduleInteractionScan, true);

    console.log("[Antigravity i18n] Localization runner initialized (lang=" + currentLang + ").");
})();
