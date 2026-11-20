#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Sync upstream dictionaries from qqxpee/antigravity2-cn and merge with
local priority overrides (scripts/custom_overrides.json).

Priority order:
  1. Upstream qqxpee/antigravity2-cn/dicts/*.json (base layer)
  2. scripts/custom_overrides.json (highest priority, always wins)
"""

import argparse
import datetime
import glob
import json
import os
import re
import urllib.request

UPSTREAM_API_URL = "https://api.github.com/repos/qqxpee/antigravity2-cn/contents/dicts"
UPSTREAM_RAW_BASE = "https://raw.githubusercontent.com/qqxpee/antigravity2-cn/main/dicts"
DICT_LOAD_ORDER = [
    "common.json",
    "menu_nav.json",
    "page_agents.json",
    "page_mcp_knowledge.json",
    "page_settings.json",
    "page_main.json",
]


def fetch_json(url, timeout=15):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "agy-chinese-sync/1.0", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_upstream_from_github():
    entries = fetch_json(UPSTREAM_API_URL)
    available = {item["name"] for item in entries if item.get("name", "").endswith(".json")}
    ordered = [name for name in DICT_LOAD_ORDER if name in available]
    for name in sorted(available):
        if name not in ordered:
            ordered.append(name)

    merged = {}
    for name in ordered:
        data = fetch_json(f"{UPSTREAM_RAW_BASE}/{name}")
        if isinstance(data, dict):
            merged.update(data)
            print(f"[✓] 拉取上游词典 {name}: {len(data)} 条")
    return merged


def load_upstream_from_local(dicts_dir):
    files = {os.path.basename(p): p for p in glob.glob(os.path.join(dicts_dir, "*.json"))}
    ordered = [name for name in DICT_LOAD_ORDER if name in files]
    for name in sorted(files):
        if name not in ordered:
            ordered.append(name)

    merged = {}
    for name in ordered:
        with open(files[name], "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            merged.update(data)
            print(f"[✓] 读取本地上游词典 {name}: {len(data)} 条")
    return merged


def bump_locale_version(current_ver):
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y.%m.%d")
    if current_ver.startswith(today + "."):
        try:
            seq = int(current_ver.split(".")[-1]) + 1
            return f"{today}.{seq}"
        except ValueError:
            pass
    return f"{today}.1"


def main():
    parser = argparse.ArgumentParser(description="Merge upstream antigravity2-cn dicts with custom_overrides.json")
    parser.add_argument("--local-dicts", help="Optional local dicts/ directory instead of fetching from GitHub")
    args = parser.parse_args()

    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    overrides_path = os.path.join(script_dir, "custom_overrides.json")
    output_path = os.path.join(script_dir, "i18n_data.json")
    manifest_path = os.path.join(repo_root, "manifest.json")
    readme_path = os.path.join(repo_root, "README.md")

    if not os.path.exists(overrides_path):
        raise FileNotFoundError(f"Missing {overrides_path}")

    with open(overrides_path, "r", encoding="utf-8") as f:
        overrides = json.load(f)

    if args.local_dicts:
        upstream_exact = load_upstream_from_local(args.local_dicts)
    else:
        upstream_exact = load_upstream_from_github()

    # Merge: upstream base + custom overrides on top
    merged_exact = dict(upstream_exact)
    custom_exact = overrides.get("exact", {})
    merged_exact.update(custom_exact)

    # Validate & keep reverse_map consistent with merged_exact
    raw_rev = overrides.get("reverse_map", {})
    merged_rev = {}
    for zh, en in raw_rev.items():
        actual_zh = merged_exact.get(en)
        if actual_zh:
            merged_rev[actual_zh] = en
        else:
            merged_rev[zh] = en

    regex_rules = overrides.get("regex_rules", [])
    for rule in regex_rules:
        re.compile(rule["pattern"])

    new_data = {
        "exact": merged_exact,
        "reverse_map": merged_rev,
        "regex_rules": regex_rules,
        "exemptions": overrides.get("exemptions", []),
    }

    old_text = ""
    if os.path.exists(output_path):
        with open(output_path, "r", encoding="utf-8") as f:
            old_text = f.read()

    new_text = json.dumps(new_data, ensure_ascii=False, indent=2) + "\n"
    if new_text == old_text:
        print("[✓] i18n_data.json 无变化，无需更新版本。")
        return

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(new_text)
    print(
        f"[✓] 已生成合并词库 i18n_data.json: exact={len(merged_exact)} "
        f"(上游 {len(upstream_exact)} + 自定义优先覆盖 {len(custom_exact)}), "
        f"reverse_map={len(merged_rev)}, regex_rules={len(regex_rules)}"
    )

    # Bump manifest.json locale_version
    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        old_ver = manifest.get("locale_version", "")
        new_ver = bump_locale_version(old_ver)
        manifest["locale_version"] = new_ver
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"[✓] 已更新 manifest.json locale_version: {old_ver} -> {new_ver}")

    # Update stats line in README.md if present
    if os.path.exists(readme_path):
        with open(readme_path, "r", encoding="utf-8") as f:
            readme = f.read()
        updated_readme = re.sub(
            r"内置 \*\*[\d,]+\+ 条\*\*精确词条、\*\*\d+ 条\*\*动态正则规则（支持额度刷新倒计时中文单位、模型标签等）以及 \*\*\d+ 条\*\*受控组件反向映射",
            f"内置 **{len(merged_exact):,}+ 条**精确词条、**{len(regex_rules)} 条**动态正则规则（支持额度刷新倒计时中文单位、模型标签等）以及 **{len(merged_rev)} 条**受控组件反向映射",
            readme,
        )
        if updated_readme != readme:
            with open(readme_path, "w", encoding="utf-8") as f:
                f.write(updated_readme)
            print("[✓] 已同步更新 README.md 词库统计。")


if __name__ == "__main__":
    main()
