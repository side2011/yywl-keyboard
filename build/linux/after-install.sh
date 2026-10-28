#!/bin/bash
# .deb 安装后自动执行（以 root 身份运行）
#
# 目的：让小白用户"双击安装 .deb → 输一次密码"就把 udev 权限配好，
#       不用打开终端、不用复制命令、不用自己找 root。
#
# 规则含义：把这几家 VID 的 HID 设备（hidraw 与 usb 两条路径）设为所有人可读写，
#           浏览器 WebHID 与桌面版 node-hid 都依赖它。
set -e

RULES=/lib/udev/rules.d/99-yywl-keyboard.rules

cat > "$RULES" <<'EOF'
# YYWL 小键盘配置工具：允许普通用户访问键盘 HID 设备
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="413d", MODE="0666"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="8808", MODE="0666"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="514c", MODE="0666"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1189", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="413d", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="8808", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="514c", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="1189", MODE="0666"
EOF
chmod 644 "$RULES"

udevadm control --reload-rules || true
udevadm trigger || true

exit 0
