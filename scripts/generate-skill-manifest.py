#!/usr/bin/env python3
"""
generate-skill-manifest.py — 从 skill-store/ 生成 manifest.json

读取每个 skill 的 SKILL.md frontmatter，输出标准化的 manifest.json。
配合 pack-skills.sh 使用（sh 负责打 zip，py 负责生成索引）。

用法: python3 scripts/generate-skill-manifest.py [skill-store目录] [输出路径]
默认: skill-store/ → web/dist/skills/manifest.json
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_frontmatter(content: str) -> dict:
    """解析 YAML frontmatter（简易版，只处理顶层 key: value 和 metadata 嵌套）"""
    fm = {}
    if not content.startswith("---"):
        return fm
    end = content.find("---", 3)
    if end == -1:
        return fm
    block = content[3:end].strip()

    in_metadata = False
    for line in block.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        # metadata 嵌套块
        if stripped == "metadata:":
            in_metadata = True
            continue
        if in_metadata and not line.startswith(" ") and not line.startswith("\t"):
            in_metadata = False

        m = re.match(r"^(\w+):\s*(.*)$", stripped)
        if not m:
            # 处理 metadata 块内的缩进 key
            m2 = re.match(r"^\s+(\w+):\s*(.*)$", line)
            if m2 and in_metadata:
                key, val = m2.group(1), m2.group(2).strip()
                if key == "skill_version":
                    fm["version"] = val.strip('"\'')
            continue

        key, val = m.group(1), m.group(2).strip()

        # 处理 tags: [a, b, c] 格式
        if val.startswith("[") and val.endswith("]"):
            items = [x.strip().strip('"\'') for x in val[1:-1].split(",") if x.strip()]
            fm[key] = items
        # 处理 keywords: [a, b]（在 triggers 下）
        else:
            fm[key] = val.strip('"\'')

    return fm


def main():
    root = Path(__file__).resolve().parent.parent
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "skill-store"
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "web" / "dist" / "skills"

    if not src.is_dir():
        print(f"❌ skill-store 目录不存在: {src}", file=sys.stderr)
        sys.exit(1)

    out_dir.mkdir(parents=True, exist_ok=True)

    skills = []
    for skill_dir in sorted(src.iterdir()):
        if not skill_dir.is_dir():
            continue
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            print(f"⚠️  跳过 {skill_dir.name}（无 SKILL.md）", file=sys.stderr)
            continue

        content = skill_md.read_text(encoding="utf-8")
        fm = parse_frontmatter(content)

        dir_name = skill_dir.name
        name = fm.get("name", dir_name)
        desc = fm.get("description", "")
        category = fm.get("category", "general")
        version = fm.get("version", "1.0.0")
        tags = fm.get("tags", [])

        # 统计文件数
        file_count = sum(1 for _ in skill_dir.rglob("*") if _.is_file())

        skills.append({
            "id": dir_name,
            "name": name,
            "dirName": dir_name,
            "description": desc,
            "category": category,
            "tags": tags if isinstance(tags, list) else [],
            "version": version,
            "zipUrl": f"/skills/{dir_name}.zip",
            "fileCount": file_count,
        })
        print(f"📦 {dir_name}: {name} (v{version}, {file_count} files)")

    manifest = {
        "version": "1.0.0",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(skills),
        "skills": skills,
    }

    out_path = out_dir / "manifest.json"
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ manifest: {out_path} ({len(skills)} skills)")


if __name__ == "__main__":
    main()
