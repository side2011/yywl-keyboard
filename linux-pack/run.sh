#!/usr/bin/env bash
# ============================================================
# 颖昱物联 键盘配置工具 —— 国产系统启动脚本
#   适用: 银河麒麟 / 中标麒麟 / 统信 UOS / 深度 deepin / openKylin 等
#
# 为什么需要这个脚本:
#   国产系统普遍关闭了 user namespace, Electron 自带的 Chromium 沙箱会因此
#   起不来(报 sandbox 相关错误), 所以这里默认加 --no-sandbox。
#   同时检查目录是否被 noexec 挂载(等保加固常见), 提前给出可执行的建议。
# ============================================================
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
LOG="${XDG_CACHE_HOME:-$HOME/.cache}/yywl-config.log"

APP=""
for cand in "$HERE/yywl-config" "$HERE"/yywl*; do
  if [ -f "$cand" ] && [ ! -d "$cand" ]; then APP="$cand"; break; fi
done
if [ -z "$APP" ]; then
  echo "✗ 找不到程序主文件(yywl-config), 请确认解压完整。"
  exit 1
fi

# ---- 1) noexec 检查 (等保加固的系统会禁止从 /home 执行程序) ----
MOUNT_OPTS=""
if command -v findmnt >/dev/null 2>&1; then
  MOUNT_OPTS="$(findmnt -no OPTIONS -T "$HERE" 2>/dev/null || true)"
fi
if echo "$MOUNT_OPTS" | grep -q "noexec"; then
  echo "⚠ 当前目录所在分区带有 noexec 挂载选项, 程序无法从这里的直接运行。"
  echo ""
  echo "  解决方式(只需要一次管理员密码):"
  echo "    sudo mkdir -p /opt/yywl-config"
  echo "    sudo cp -r \"$HERE/.\" /opt/yywl-config/"
  echo "    cd /opt/yywl-config && ./run.sh"
  echo ""
  echo "  拷到 /opt 之后就不再需要管理员权限了。"
  exit 1
fi

# ---- 2) 补可执行权限 ----
for f in "$HERE"/*; do
  case "$f" in
    *.so|*.so.*|*.pak|*.dat|*.json|*.bin|*.png) ;;
    *) [ -f "$f" ] && [ ! -x "$f" ] && chmod +x "$f" 2>/dev/null ;;
  esac
done

# ---- 3) 键盘访问权限提示 ----
if [ ! -f /etc/udev/rules.d/99-yywl-keyboard.rules ]; then
  echo "提示: 第一次使用建议先运行 ./install-hid.sh 配置键盘访问权限"
  echo "      (需要一次管理员密码; 不配置的话可能连接不到键盘)"
  echo ""
fi

# ---- 4) 启动 ----
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

# --no-sandbox          国产系统普遍禁用 user namespace, 沙箱会起不来
# --disable-gpu-sandbox 部分国产显卡驱动下 GPU 沙箱异常
# --disable-dev-shm-usage /dev/shm 偏小(容器/精简系统常见)
ARGS="--no-sandbox --disable-gpu-sandbox --disable-dev-shm-usage"
echo "启动中..."

"$APP" $ARGS "$@" >"$LOG" 2>&1
CODE=$?

if [ $CODE -ne 0 ]; then
  echo ""
  echo "✗ 程序退出, 返回码 $CODE。以下是最后几行日志:"
  echo "------------------------------------------"
  tail -n 15 "$LOG" 2>/dev/null
  echo "------------------------------------------"
  echo "日志文件: $LOG"
  echo "也可以手动重试: \"$APP\" $ARGS"
  if [ -t 0 ]; then
    echo ""
    read -r -p "按回车键关闭..." _
  fi
fi
exit $CODE
