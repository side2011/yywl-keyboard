#!/bin/bash
# ============================================================
# 小键盘 - Linux udev 权限修复脚本
# 适用系统: 银河麒麟 / Ubuntu / Deepin / 统信UOS 等
# 使用方法: 右键此文件 → 属性 → 允许执行，然后终端运行:
#           sudo bash linux-udev-fix.sh
# ============================================================

RULES_FILE="/etc/udev/rules.d/99-yywl-keyboard.rules"

echo "=========================================="
echo " 小键盘 - Linux HID 权限配置工具"
echo "=========================================="
echo ""

# 检查 root 权限
if [ "$EUID" -ne 0 ]; then
  echo "[错误] 请使用 sudo 运行此脚本"
  echo "  正确命令: sudo bash $0"
  exit 1
fi

echo "[1/3] 写入 udev 规则文件..."
cat > "$RULES_FILE" << 'EOF'
# 多功能小键盘 - WebHID 访问权限
# 旧协议 VID 0x413D
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="413d", MODE="0666"
# 旧协议 VID 0x8808
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="8808", MODE="0666"
# 新协议 / 蓝牙 VID 0x514C
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="514c", MODE="0666"
# K10 / 蓝牙 VID 0x1189
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1189", MODE="0666"
EOF

if [ $? -eq 0 ]; then
  echo "  ✓ 规则已写入 $RULES_FILE"
else
  echo "  ✗ 写入失败，请检查磁盘权限"
  exit 1
fi

echo ""
echo "[2/3] 重载 udev 规则..."
udevadm control --reload-rules
udevadm trigger
echo "  ✓ 规则已生效"

echo ""
echo "[3/3] 完成！"
echo ""
echo "=========================================="
echo " 请按以下步骤操作："
echo "  1. 拔掉键盘 USB 线"
echo "  2. 等待 2-3 秒"
echo "  3. 重新插入键盘"
echo "  4. 刷新浏览器页面，重新点击「连接键盘」"
echo "=========================================="
echo ""
