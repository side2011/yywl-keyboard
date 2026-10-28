#!/usr/bin/env bash
# YYWL 小键盘 —— Linux 权限修复脚本（统信 UOS / 麒麟 / Ubuntu 等）
#
# 作用：写入 udev 规则，让浏览器（WebHID）和桌面版（node-hid）能访问小键盘。
# 需要管理员密码；不需要 root 登录。
#
# 用法：
#   1) 下载本文件，右键 → 属性 → 权限 → 勾选"允许作为程序执行"
#   2) 双击运行，或终端执行： bash 本文件
#   3) 弹窗里输入管理员密码 → 完成后拔插键盘 USB 线

set -u

RULES=/etc/udev/rules.d/99-yywl-keyboard.rules
TMP=/tmp/yywl-udev-$$.tmp

cat > "$TMP" <<'EOF'
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="413d", MODE="0666"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="8808", MODE="0666"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="514c", MODE="0666"
SUBSYSTEM=="hidraw", ATTRS{idVendor}=="1189", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="413d", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="8808", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="514c", MODE="0666"
SUBSYSTEM=="usb", ATTRS{idVendor}=="1189", MODE="0666"
EOF

echo "==== YYWL 小键盘权限修复 ===="
echo "规则内容："
cat "$TMP"
echo

if command -v pkexec >/dev/null 2>&1; then
  echo "[1/2] 正在申请管理员权限（弹窗里输入管理员密码，不是 root 密码）..."
  pkexec bash -c "cp '$TMP' '$RULES' && udevadm control --reload-rules && udevadm trigger"
  RC=$?
else
  echo "[1/2] 未找到 pkexec，改用 sudo ..."
  sudo bash -c "cp '$TMP' '$RULES' && udevadm control --reload-rules && udevadm trigger"
  RC=$?
fi

rm -f "$TMP"
echo
if [ $RC -eq 0 ]; then
  echo "✅ 权限配置完成"
  echo "   请拔插键盘 USB 线，然后回到页面点「连接键盘」。"
  echo
  echo "   桌面版也可以直接用了（无需再以管理员身份启动）。"
else
  echo "❌ 配置失败（错误码 $RC）—— 规则没有写进去，权限还没配好"
  echo
  echo "如果上面出现 No root privileges / 认证失败，说明当前账号没有管理员权限（或取消了密码框）。"
  echo
  echo "下一步（按顺序试）："
  echo "  1) 控制中心 → 通用 → 开发者模式，开启后再运行一次本脚本（需要管理员密码）"
  echo "  2) 让 IT 管理员执行（一条命令，之后这台机器所有账号都能用）："
  echo "     sudo cp /tmp/yywl-udev.tmp $RULES && sudo udevadm control --reload-rules && sudo udevadm trigger"
  echo "     （若 /tmp 文件已删，管理员可直接把本脚本里的规则内容写进 $RULES）"
  echo "  3) 换一台有管理员权限的电脑配置键盘（配置保存在键盘里，配完插回原电脑即可用）"
  echo
  echo "验证是否已生效（成功后应看到 ✓）："
  echo "  grep -c hidraw $RULES         # 期望输出 4"
  echo "  ls -l /dev/hidraw*            # 期望权限是 crw-rw-rw-"
fi
echo
read -r -p "按回车关闭窗口..." _
