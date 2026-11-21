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
        if (typeof window.__antigravity_translateWholePage === 'function') {
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

    // 2. Isolation & Exemption Checks
    var EXCLUDED_TAGS = {
        "SCRIPT": true,
        "STYLE": true,
        "PRE": true,
        "CODE": true,
        "TEXTAREA": true
    };

    function isInsideExcluded(node) {
        var curr = node;
        while (curr && curr !== document.body && curr !== document.documentElement) {
            if (curr.nodeType === 1) {
                var tag = curr.tagName;
                if (EXCLUDED_TAGS[tag]) return true;
                if (curr.isContentEditable) return true;
                var cls = curr.className;
                if (typeof cls === "string" && (
                    cls.indexOf("monaco-editor") !== -1 ||
                    cls.indexOf("token") !== -1 ||
                    cls.indexOf("syntax") !== -1
                )) {
                    return true;
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

    // 3. Node Translation Engine (Pure value matching, no harmful WeakSet blocking)
    function translateTextNode(textNode) {
        if (!textNode || textNode.nodeType !== 3) return;
        var val = textNode.nodeValue;
        if (!val || !val.trim()) return;

        if (isInsideExcluded(textNode)) return;

        var translated = getTranslatedText(val);
        if (translated !== null && translated !== val) {
            textNode.nodeValue = translated;
        }
    }

    function translateElementAttributes(el) {
        if (!el || el.nodeType !== 1) return;
        if (EXCLUDED_TAGS[el.tagName]) return;

        // placeholder
        if (el.hasAttribute("placeholder")) {
            var ph = el.getAttribute("placeholder");
            var tPh = getTranslatedText(ph);
            if (tPh !== null && tPh !== ph) el.setAttribute("placeholder", tPh);
        }
        // title
        if (el.hasAttribute("title")) {
            var tit = el.getAttribute("title");
            var tTit = getTranslatedText(tit);
            if (tTit !== null && tTit !== tit) el.setAttribute("title", tTit);
        }
        // aria-label
        if (el.hasAttribute("aria-label")) {
            var al = el.getAttribute("aria-label");
            var tAl = getTranslatedText(al);
            if (tAl !== null && tAl !== al) el.setAttribute("aria-label", tAl);
        }
        // alt
        if (el.hasAttribute("alt")) {
            var altVal = el.getAttribute("alt");
            var tAlt = getTranslatedText(altVal);
            if (tAlt !== null && tAlt !== altVal) el.setAttribute("alt", tAlt);
        }
        // data-tooltip
        if (el.hasAttribute("data-tooltip")) {
            var dt = el.getAttribute("data-tooltip");
            var tDt = getTranslatedText(dt);
            if (tDt !== null && tDt !== dt) el.setAttribute("data-tooltip", tDt);
        }
        // input button/submit/reset value
        if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit" || el.type === "reset") && el.value) {
            var tVal = getTranslatedText(el.value);
            if (tVal !== null && tVal !== el.value) el.value = tVal;
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

    function translateSubtree(root) {
        if (!root) return;
        if (root.nodeType === 3) {
            translateTextNode(root);
            return;
        }
        if (root.nodeType === 1 || root.nodeType === 11) {
            if (root.nodeType === 1) {
                if (isInsideExcluded(root)) return;
                translateElementAttributes(root);
                if (root.shadowRoot) {
                    observeShadow(root.shadowRoot);
                    translateSubtree(root.shadowRoot);
                }
            }
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
            var node;
            while ((node = walker.nextNode())) {
                translateTextNode(node);
            }
            var elementsWithAttrs = root.querySelectorAll("[placeholder], [title], [aria-label], [alt], [data-tooltip], input[type='button'], input[type='submit'], input[type='reset']");
            for (var i = 0; i < elementsWithAttrs.length; i++) {
                var el = elementsWithAttrs[i];
                translateElementAttributes(el);
                if (el.shadowRoot) {
                    observeShadow(el.shadowRoot);
                    translateSubtree(el.shadowRoot);
                }
            }
        }
    }

    // 4. Initial Full Page Translation & Lifecycle Hooks
    function translateWholePage() {
        var target = document.body || document.documentElement;
        if (target) {
            translateSubtree(target);
        }
    }
    window.__antigravity_translateWholePage = translateWholePage;

    translateWholePage();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", translateWholePage);
    }
    window.addEventListener("load", translateWholePage);

    // SPA client-side routing triggers
    window.addEventListener("popstate", function() { setTimeout(translateWholePage, 50); });
    window.addEventListener("hashchange", function() { setTimeout(translateWholePage, 50); });

    // Multi-turn progressive scans for React initial async rendering
    var scanDelays = [100, 250, 500, 1000, 1800, 3000, 5000];
    for (var k = 0; k < scanDelays.length; k++) {
        setTimeout(translateWholePage, scanDelays[k]);
    }

    // 5. High-Performance MutationObserver (observes childList on documentElement)
    var isTranslating = false;
    var observer = new MutationObserver(function (mutations) {
        if (isTranslating) return;
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
        if (interactionTimer) clearTimeout(interactionTimer);
        interactionTimer = setTimeout(function () {
            interactionTimer = null;
            if (!isTranslating) {
                isTranslating = true;
                try {
                    translateWholePage();
                } finally {
                    isTranslating = false;
                }
            }
        }, 80);
    }
    window.addEventListener("click", scheduleInteractionScan, true);
    window.addEventListener("contextmenu", scheduleInteractionScan, true);
    window.addEventListener("mousedown", scheduleInteractionScan, true);
    window.addEventListener("change", scheduleInteractionScan, true);
    window.addEventListener("keyup", scheduleInteractionScan, true);
    window.addEventListener("focusin", scheduleInteractionScan, true);

    console.log("[Antigravity i18n] Localization runner successfully initialized and active.");
})();
