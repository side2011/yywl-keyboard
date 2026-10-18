#!/usr/bin/env bash
# ============================================================
# 颖昱物联 键盘配置工具 —— 键盘访问权限配置
#
# 国产系统上 /dev/hidraw* 默认只有 root 能读写, 普通用户连不上键盘,
# 所以需要装一条 udev 规则。只需要执行一次, 需要管理员密码。
#
# 用法:  ./install-hid.sh
# ============================================================
set -u

RULES="/etc/udev/rules.d/99-yywl-keyboard.rules"

RULES_CONTENT='# 颖昱物联多功能小键盘 - 允许普通用户访问设备
# 旧协议 VID 0x413D
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="413d", MODE="0666"
# 旧协议 VID 0x8808
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="8808", MODE="0666"
# 新协议 / 蓝牙 VID 0x514C
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="514c", MODE="0666"
# K10 / 蓝牙 VID 0x1189
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1189", MODE="0666"'

do_install() {
  echo "[1/3] 写入规则文件 $RULES"
  printf '%s\n' "$RULES_CONTENT" > "$RULES" || { echo "✗ 写入失败"; exit 1; }
  chmod 644 "$RULES"

  echo "[2/3] 重新加载 udev 规则"
  if command -v udevadm >/dev/null 2>&1; then
    udevadm control --reload-rules 2>/dev/null || true
    udevadm trigger 2>/dev/null || true
  fi

  echo "[3/3] 检查当前已插入的设备权限"
  ls -l /dev/hidraw* 2>/dev/null || echo "  (当前没有 hidraw 设备, 插上键盘后自动生效)"

  echo ""
  echo "✅ 完成。请拔插一次键盘的 USB 线, 然后重新打开配置工具。"
}

if [ "$(id -u)" -eq 0 ]; then
  do_install
else
  echo "需要管理员权限来写入 /etc/udev/rules.d/, 即将请求授权…"
  echo ""
  if command -v pkexec >/dev/null 2>&1; then
    pkexec bash "$0" && exit 0
    echo ""
    echo "图形授权失败, 请改用终端执行:  sudo bash \"$0\""
    exit 1
  elif command -v sudo >/dev/null 2>&1; then
    sudo bash "$0"
    exit $?
  else
    echo "✗ 系统里没有 pkexec 也没有 sudo, 请用 root 账号执行:"
    echo "   su -c 'bash \"$0\"'"
    exit 1
  fi
fi
