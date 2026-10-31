#!/bin/bash
# 安装/更新仓库自带的 git 钩子（克隆后跑一次即可）
#   用法: bash scripts/install-git-hooks.sh
set -e
ROOT=$(git rev-parse --show-toplevel)
SRC="$ROOT/scripts/git-hooks"
DST="$ROOT/.git/hooks"
mkdir -p "$DST"
for f in "$SRC"/*; do
  name=$(basename "$f")
  cp "$f" "$DST/$name"
  chmod +x "$DST/$name"
  echo "  已安装钩子: $name"
done
echo "完成。之后 git commit 会自动推送到 Gitee（带重试与自动 rebase）。"