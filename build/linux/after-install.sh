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

# ---------------------------------------------------------------
# 修「装好了但双击打不开」：
# 国产系统（UOS / 麒麟）默认禁用非特权 user namespace，
# 且 chrome-sandbox 不是 setuid root，Electron 会直接起不来（没有任何提示）。
# 处理：给启动参数加 --no-sandbox，并补 chrome-sandbox 的 setuid 位。
# ---------------------------------------------------------------
APP_BIN=$(find /opt -maxdepth 3 -name 'yywl-config' -type f 2>/dev/null | head -1)
if [ -n "$APP_BIN" ]; then
  APP_DIR=$(dirname "$APP_BIN")
  chmod +x "$APP_BIN" 2>/dev/null || true
  chmod 4755 "$APP_DIR/chrome-sandbox" 2>/dev/null || true

  # 1) 开始菜单的启动项：补 --no-sandbox
  DESKTOP=/usr/share/applications/yywl-config.desktop
  if [ -f "$DESKTOP" ]; then
    sed -i "s|^Exec=.*|Exec=\"$APP_BIN\" --no-sandbox %U|" "$DESKTOP"
  fi

  # 2) 终端也能启动：/usr/bin/yywl-config（并把输出写进日志，方便排查）
  cat > /usr/bin/yywl-config <<EOF
#!/bin/bash
# YYWL 键盘配置工具启动器（安装脚本生成）
# 失败时把输出写到 ~/.yywl-launch.log，客户把这个文件发给技术支持即可
LOG="\$HOME/.yywl-launch.log"
echo "==== \$(date '+%F %T') 启动 ====" >> "\$LOG"
"$APP_BIN" --no-sandbox "\$@" >> "\$LOG" 2>&1
RC=\$?
if [ \$RC -ne 0 ]; then
  echo "退出码 \$RC" >> "\$LOG"
fi
exit \$RC
EOF
  chmod 755 /usr/bin/yywl-config

  # 3) 「兼容模式」入口：主入口仍打不开时的兜底（关 GPU / 关 shm / 关沙箱）
  cat > /usr/share/applications/yywl-config-safe.desktop <<EOF
[Desktop Entry]
Name=YYWL 键盘配置工具（兼容模式）
Comment=双击没反应时用这个启动
Exec="$APP_BIN" --no-sandbox --disable-gpu --disable-software-rasterizer --disable-dev-shm-usage %U
Terminal=false
Type=Application
Icon=yywl-config
StartupWMClass=YYWL键盘配置工具
Categories=Utility;
EOF
  chmod 644 /usr/share/applications/yywl-config-safe.desktop
fi

exit 0
