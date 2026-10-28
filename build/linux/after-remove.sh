#!/bin/bash
# .deb 卸载后执行（以 root 身份运行）
# 清掉我们装的 udev 规则，避免残留
set -e
rm -f /lib/udev/rules.d/99-yywl-keyboard.rules
udevadm control --reload-rules || true
udevadm trigger || true
exit 0
