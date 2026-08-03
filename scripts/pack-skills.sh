#!/usr/bin/env bash
# ============================================================
# pack-skills.sh — 打包 skill-store/ 里的所有 skill
#
# 流程：
#   1. 遍历 skill-store/*/，每个打成 dist/skills/{name}.zip
#   2. 调用 Python 生成 dist/skills/manifest.json
#
# 用法：bash scripts/pack-skills.sh [skill-store目录] [输出目录]
# 默认：skill-store/ → web/dist/skills/
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="${1:-$ROOT/skill-store}"
OUT="${2:-$ROOT/web/dist/skills}"
SCRIPTS="$ROOT/scripts"

if [ ! -d "$SRC" ]; then
  echo "❌ skill-store 目录不存在: $SRC"
  exit 1
fi

mkdir -p "$OUT"
rm -f "$OUT"/*.zip "$OUT/manifest.json"

echo "🔗 打包 skill ZIP..."
for skill_dir in "$SRC"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  if [ ! -f "$skill_dir/SKILL.md" ]; then
    echo "⚠️  跳过 $skill_name（无 SKILL.md）"
    continue
  fi
  (cd "$SRC" && zip -r -q "$OUT/$skill_name.zip" "$skill_name")
  echo "  📦 $skill_name.zip"
done

echo ""
echo "📋 生成 manifest.json..."
if command -v python3 &>/dev/null; then
  python3 "$SCRIPTS/generate-skill-manifest.py" "$SRC" "$OUT"
else
  python "$SCRIPTS/generate-skill-manifest.py" "$SRC" "$OUT"
fi

echo ""
echo "✅ 打包完成 → $OUT"
