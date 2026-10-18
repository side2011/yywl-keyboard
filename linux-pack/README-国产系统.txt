====================================================
 颖昱物联 多功能小键盘配置工具 —— 国产系统便携版
====================================================

适用系统: 银河麒麟 / 中标麒麟 / 统信 UOS / 深度 deepin /
          openKylin / 优麒麟 / 中科方德 等 (x86_64 或 ARM64)

这个包和 AppImage 的区别:
  · 不需要 FUSE/libfuse2 (国产系统经常缺这个, AppImage 会因此起不来)
  · 不需要 chmod +x 整个 AppImage 再挂载运行
  · 默认关闭 Chromium 沙箱 (国产系统普遍禁用 user namespace, 否则会报错)
  · 自动检查"目录是否禁止执行(noexec)", 避免等保加固机器上白折腾


-------------------- 使用步骤(3 步) --------------------

1) 解压到一个你常用的目录, 例如:
       ~/应用/yywl-config

2) 配置键盘访问权限(只需一次, 需要管理员密码):
       在解压目录里右键打开终端, 执行:
           ./install-hid.sh
       (或者在文件管理器里双击这个脚本, 选择"在终端中运行")

   这一步是做这个: 往 /etc/udev/rules.d/ 写一条规则,
   让普通用户也能读写键盘设备。不配置的话, 工具可能连不上键盘。

3) 启动:
           ./run.sh

   以后每次都用 run.sh 启动即可。
   也可以把 run.sh 发送到桌面快捷方式。


-------------------- 常见问题 --------------------

Q: 提示"带有 noexec 挂载选项, 程序无法执行"
A: 说明 /home 被等保策略设置了"禁止执行程序"。按提示把整个目录拷到
   /opt 即可(只需一次管理员密码):
       sudo mkdir -p /opt/yywl-config
       sudo cp -r ~/应用/yywl-config/. /opt/yywl-config/
       cd /opt/yywl-config && ./run.sh

Q: 双击 run.sh 没反应
A: 文件管理器默认不执行脚本。右键 → "在终端中运行",
   或打开终端后输入  ./run.sh

Q: 窗口没出来, 或者闪退
A: run.sh 会把日志写到 ~/.cache/yywl-config.log, 失败时会把最后几行打印出来。
   也可以手动运行看完整报错:
       ./yywl-config --no-sandbox

Q: 连不上键盘
A: 先执行 ./install-hid.sh, 然后拔插一次键盘的 USB 线, 重开工具。
   确认系统里能看到设备:  ls -l /dev/hidraw*

Q: 界面字太小 / 太大
A: 部分国产桌面环境缩放适配不好, 可以设置环境变量后启动:
       QT_SCALE_FACTOR=1.25 ./run.sh
   或者改 run.sh 里的 --force-device-scale-factor=1.25

Q: 我的机器是飞腾/鲲鹏(ARM64), 该下哪个?
A: 终端执行  uname -m
       输出 x86_64   → 用 x64 版
       输出 aarch64  → 用 arm64 版
   龙芯(loongarch64)暂不支持。


技术支持 QQ: 1291285148
