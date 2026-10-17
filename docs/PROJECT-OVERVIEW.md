# YYWL 多功能小键盘配置系统 — 项目分析与接手大纲

> 分析对象：`E:\AI项目\yywl-keyboard-app`
> 分析时间：2026-10-17（当日仍有提交）
> 分析方式：只读通读 + 四个子系统并行深读（未修改任何源码、未运行构建）
> 品牌：颖昱物联（YYWL / YingYu IoT）　对外站点：`https://key.itytsoft.com/`（2026-10 已从 /ws/ 迁移到根目录）

---

## 0. 一页速览

这是一个**「一套硬件协议 × 多种上位机形态」**的嵌入式外设配置工具项目族。硬件是多功能自定义小键盘（把任意按键映射成键盘键 / 鼠标动作 / 多媒体键 / 多键组合 / 宏），软件负责把用户的配置写进键盘的 Flash。

| # | 子系统 | 目录 | 技术 | 当前角色 | 状态判断 |
|---|---|---|---|---|---|
| 1 | **配置网页（主战场）** | `src/` + `public/` + `desktop-main.cjs` | React 19 + Vite 7 + WebHID | 线上主入口，也在浏览器里跑 | 活跃开发，最近改动集中于此 |
| 2 | **网页的 Electron 桌面版** | 同上（`npm run desktop`） | Electron 33 + node-hid | 离线/绿色版分发，绕开浏览器兼容问题 | 可用，1 个已知坑（见 §5.3） |
| 3 | **快速配置工具** | `quick-config/` | Electron + node-hid（主进程直连） | 工厂/售后/批量快速改键，带在线增量更新 | 可用，有 1 个确定性 Bug（见 §6.6） |
| 4 | **老 USB 款 C# 软件** | `yywlkey/` | C# / .NET Framework 4.8 / WinForms | 历史资产，v3.7.9 绿包仍在官网供下载 | 只读参考 |
| 5 | **老蓝牙款 Qt 软件** | `QT9/` | C++ / Qt 5.14.2 / MinGW 32-bit | 历史资产，蓝牙款专用 | 只读参考 |

**三条最该先知道的事实**

1. **协议有三套，且靠"弱信号"猜设备**：旧协议（CH55x）、新协议（AC632N，"版本2.0"）、蓝牙无线款（QT KEY_PRO 逆向）。三者 VID/PID 有重叠（`0x514C/0x8850` 同时可能是 USB 新协议款、蓝牙款），分流全靠"命令是否超时 / 有没有型号名 / 有没有 0xFF00 接口"的组合判断（`src/components/KeyboardConnector.jsx:277-382`）。**这是全项目最脆弱的地方**，改任何固件行为都可能让客户被误跳到"请下载专用软件"页面。
2. **协议代码被复制了三份**：`src/services/*`（WebHID 版）、`quick-config/protocols/*`（node-hid 版）、以及 C#/Qt 两套原始实现。三份之间已经开始漂移（例如 `BT_PIDS` 两处不一致、quick-config 的旧协议灯光路径有 `mode1Name` 未定义引用）。
3. **前端无测试、无类型、无 schema 版本**：持久化只靠 `localStorage`（网页）和 `userData/saved-configs.json`（快速配置），配置格式一旦变动没有迁移能力。

---

## 1. 业务全景

### 1.1 产品线（按协议世代划分）

| 世代 | 芯片/协议 | VID:PID | 代表型号 | 配置软件 |
|---|---|---|---|---|
| 旧协议 | CH55x，自定义 64 字节报告 | `0x8808`:`0x6600`–`0x6618`（25 个） | 1K/2K/3K…12K、4K-side、FXJ 方向键、旋钮款 DXN、2KPlus/3KPlus | 网页 `hid-service.js` + C# `yywlkey` |
| 旧协议特例 | — | `0x1189`:`0x8834` | 10KDZ1（reportId=3） | 同上 |
| 旧协议野型号 | — | `0x413D`:`0x553A/0x553B` | 无法自动识别 | 网页/快速配置**手选型号** |
| **无线接收器（不参与配置）** | — | `0x514C`:`0x4155` | **USB 无线接收器**（厂商串 LiQi Technology） | **任何软件都不配置它** —— 只有 `0x01`(键盘/鼠标)+`0x0C`(多媒体) 接口，**没有 `0xFF00`**，所以永远不要加进过滤器（2026-10-17 已与负责人确认） |
| 新协议 | AC632N / AC104，"版本2.0"，63 字节 body + XOR | `0x514C`:`0x8850`、`0x8851` | 1~12 键新固件、方向键款（layoutId=1）、麦克风款（layoutId=5）、4 键新款 | 网页 `new-protocol.js` |
| 蓝牙无线款 | QT `KEY_PRO` 逆向，`0xFB/0xFA/0xFD/0xFE` | `0x1189`/`0x514C` : `0x8842,0x8840,0x8830-0x8833` | 蓝牙 2/3/4/5 键、4+1、旋钮 16 齿款、6+1 旋钮款 | 网页 `BtConfigurator`、Qt `MINI_KEYBOARD` |
| 同 PID 混合款 | 0x514C:0x8850/0x8851 也可能跑 Qt 协议 | — | 6+1 旋钮款 | 先 0x0B，超时再探 0xFB |

### 1.2 四条交付通道

```
                        ┌───────────────────────────────┐
   浏览器用户 ─────────▶ │ key.itytsoft.com/      (nginx) │
                        └───────────────┬───────────────┘
                                        │ WebHID (navigator.hid)
   桌面用户 ── exe ──▶ Electron 内置 http://127.0.0.1:随机端口/ ─┘
                                        │
   工厂/售后 ──▶ YYWL快速配置 (node-hid 主进程直连)
                                        │
   老客户 ──▶ yywlKey V3.7.9 绿包 (C#)  │  MINI_KEYBOARD (Qt, 蓝牙款)
                                        ▼
                                  小键盘固件 (Flash)
```

- 网页与"网页桌面版"是**同一份前端代码**，区别只在 HID 通道：浏览器用 `navigator.hid`，Electron 里由主进程用 `node-hid` 帮忙挑对接口，然后仍交给 WebHID 收发（`desktop-main.cjs:88-115`）。
- 快速配置是**独立前端 + 主进程全权处理 HID**，用 `contextBridge` 暴露 18 个 IPC 方法（`quick-config/preload.js:3-49`）。
- 蓝牙款在网页版里做成了完整配置页（`/bt`），但对更老的客户仍保留"下载专用软件"兜底（`hid-constants.js:18` → `lybz.html`）。

### 1.3 用户旅程

`/`（连接页）→ 识别设备 → 自动分流：

- 旧协议 / 新协议 → `/customize`（新协议内部再渲染 `NewProtoConfigurator`）
- 蓝牙款 → `/bt`
- 麦克风款 → `/mic`（教程视频 + 软件下载，`lqkj.net.cn`）
- 独立功能 → `/keytest`（纯浏览器按键测试，不碰 WebHID）

---

## 2. 目录地图

| 路径 | 角色 | 技术 | 在 git | 体积 |
|---|---|---|---|---|
| `src/` | 配置网页源码（26 文件） | React 19 / JSX / Tailwind+daisyUI | ✅ | 15.9 MB（含 15MB 字体） |
| `public/` | 静态资源、教程页 3 份、音效 5 个、Linux udev 脚本 | HTML | ✅ | 0.4 MB |
| `desktop-main.cjs` | 网页桌面版主进程（本地静态服务器 + HID 接口选择） | CJS | ✅ | 6 KB |
| `dist/` | 网页构建产物（含 200+ MiSans 字体分片） | — | ❌ | 8.7 MB |
| `dist-desktop/` | 桌面版 electron-builder 产物（win-unpacked） | — | ❌（**2026-10-17 已从版本库移除**） | 曾 385 MB（含 180 MB exe + 112 MB asar） |
| `quick-config/` | 快速配置工具（Electron 全栈） | Electron + React | ✅（含 `node_modules` 外的全部） | 1.2 GB（含 node_modules） |
| `yywlkey/` | 老 USB 款 C# 软件（单工程 `Hid_Common`） | .NET Framework 4.8 / WinForms | ✅（含 `packages/`、`.vs/`） | 409 MB |
| `QT9/` | 老蓝牙款 Qt 软件（单工程 `KEY_PRO`） | Qt 5.14.2 / MinGW 32-bit | ✅（**含构建产物与 Qt DLL**） | 489 MB |
| `QT9.rar` | Qt 源码归档 | — | ❌（被 ignore） | 203 MB |
| `yywlKey_V3.7.{7,8,9}_绿色版.zip` | C# 三个历史版本绿包 | — | ❌（被 ignore） | 各 30 MB |
| `docs/` | 本文档 | — | 新增 | — |
| `编译说明.txt`、`*_Fix.txt`（3 份） | 上一轮 AI 协作留下的操作笔记（GBK，部分已乱码） | — | ❌ | — |

**规模**：不含 `node_modules`/`.git` 时 1804 个文件、2.2 GB；`node_modules` 733 MB；`.git` 407 MB。

---

## 3. 本机环境现状（实测）

| 工具 | 状态 | 影响 |
|---|---|---|
| Node.js **v24.13.1** | ✅ 已装 | 可直接 `npm run dev` / `build` |
| npm **11.8.0** | ⚠️ 只能走 `npm.cmd` | PowerShell 执行策略为 Restricted，`npm.ps1` 被拒绝 |
| PowerShell 脚本执行 | ❌ 被禁 | `.ps1` 无法直接运行；本次会话需要 `-ExecutionPolicy` 绕过的脚本都失败过 |
| **git CLI** | ✅ **已安装（2026-10-17）** `C:\Tools\PortableGit`（2.45.2），已写入用户 PATH | 之前不是"没有 git"，而是**便携版只在图形客户端里、没进 PATH**。仓库另有 `.git/hooks/post-commit` 会自动 `git push origin HEAD` |
| Visual Studio 2022 | ✅ 已装 | `yywlkey` 具备编译条件（仅 x86 / net48）；但依赖 **DSkin 的绝对路径 HintPath** `D:\【4.0】DSkin20240318142543\DSkin.dll`——**本机该 DLL 存在**，换台机器就会编译失败 |
| .NET Framework 4.8 目标包 | ⚠️ 需确认 | 单有 .NET SDK 8 不能编译 Framework 4.8 工程 |
| **Qt / qmake** | ➖ 不需要（已决策） | `QT9` 仅作参考源码，不再编译 |
| hidapi / MinGW | ➖ 不需要（已决策） | 同上 |
| 磁盘 E: | 剩余 ≈ 262 GB | 充足 |

> 环境已就绪：`git` 可直接在普通终端使用（新开窗口生效，旧窗口需重开）。

---

## 4. Git 仓库体检

| 项 | 实测结果 |
|---|---|
| 远程 | `https://gitee.com/wei_tianying/yywl-keyboard-app.git`（origin） |
| 分支 | 只有 `master`（本地与 origin 同一 commit） |
| 提交数 | **55 次**（其中 2 次为 2026-10-17 的修复与清理） |
| 时间跨度 | 2026-09-04 17:55 → **2026-10-17**（项目在活跃期） |
| 最新提交 | `a1ad44d` — *chore: 清理仓库并归档项目分析* |
| 提交者 | `YYWL <1291285148@qq.com>` 与 `wei_tianying <1291285148@qq.com>`（同一人两种身份） |
| tag | 无 |
| 自动推送 | `.git/hooks/post-commit` 每次提交后自动 `git push origin HEAD` |
| LFS | `.git/config` 有 `[lfs]` 段但未实际使用；`.git` 仍有 407 MB（**历史包袱，删文件不会缩小**） |
| 已入库的大件 | **Qt 构建产物**（5 份 `opengl32sw.dll` 各 15 MB、`Qt5Gui.dll` 9.4 MB）、**NuGet `packages/`**、**`.vs/`**；`dist-desktop` 已于 10-17 移除 |
| 未入库 | `QT9.rar`、三个 `yywlKey_V3.7.x_绿色版.zip`、`dist/`、`node_modules/`、`dist-desktop/`、`dist-electron/` |

**三个仓库问题**

1. **`.gitignore` 误伤 C#**：根 `.gitignore` 里有 `*.sln`，导致 `yywlkey/yywlKey.sln` **从未入库**（8/9/12 键工程也是这样丢的）。已在本轮修正并补入版本库。
2. **构建产物入库**：Qt 的 DLL 与 `build-*` 目录、`packages/`、`.vs/` 全在版本库里，导致 `.git` 膨胀到 407 MB，且每次本地编译都会产生无意义 diff。
3. **~~无未提交改动的判断能力~~（已解决）**：装好 git 后实测工作区是干净的——只有历史误建文件 `1Key&Led` 处于"已删除未提交"状态，外加本次新增的 `docs/`。两者都已随 2026-10-17 的提交处理完毕。

**提交历史里的技术演进**（按时间读，能看出这个项目的真实痛点）

| 阶段 | 关键提交 | 说明 |
|---|---|---|
| 09-04 | 初始提交 | 从 C# 迁移到 WebHID 的起点 |
| 09-05~09-09 | 6K 无响应修复、拦截浏览器快捷键、AC632N 麦克风检测 | 设备兼容性打磨期 |
| 10-01~10-06 | 0x0B 垃圾值净化、蓝牙判定改"0x0B 超时 + probeAlive 二次确认" | **蓝牙误判是反复出现的痛点**（连续 5 个 fix） |
| 10-09~10-10 | 一键密码、手动插键、方向键十字布局 | 新协议功能扩张 |
| 10-13 | Electron 桌面版、字体方案三次返工（阿里巴巴普惠体 → 系统字体 → MiSans） | 中文小字号渲染踩坑 |
| 10-14~10-15 | 蓝牙协议整合、旋钮款、键号映射错位修复 | 逆向 QT 协议的高强度期 |
| 10-16~10-17 | 配置列表、协议模块独立、快速配置兼容三协议 | 三协议统一 |

---

## 5. 主 Web 应用（`src/`）— 未来主战场

### 5.1 形态、构建与部署

- 栈：React 19.2 + Vite 7.3 + react-router-dom 6.30 + Tailwind 3.4 + daisyUI 5 + react-hot-toast + MiSans 字体（woff2 按 unicode-range 分片，200+ 文件）。
- 路径前缀（历史为 `/ws/`，2026-10 起改为根 `/`）原本**写死三处**，改动需同步：

> **根目录部署的两个配套决定**（2026-10）
> 1. 构建产物目录用 `/static/` 而不是 `/assets/`：站点根的 `/assets` 是旧站遗留目录（`root:root` 755），FTP 账号写入报 553。见 `vite.config.js` 的 `build.assetsDir`。
> 2. 构建时为每个前端路由额外输出 `<route>/index.html`（`vite.config.js` 里的 `spaRouteFallbacks` 插件，路由表 `customize / bt / keytest / mic`）。**这样即使 nginx 没配 `try_files` SPA 回退，直接访问 `/customize` 也能打开**（nginx 默认 `index` 指令会 301 到 `/customize/` 再返回该目录的 index.html）。新增前端路由时记得同步这个数组，否则该路由只能从首页点进去、刷新会 404。
  - `vite.config.js`（`base: '/'`）
  - `src/App.jsx:14`（`basename="/ws"`）
  - `desktop-main.cjs`（本地静态服务器把 `dist` 挂到 `/`，窗口加载 `http://127.0.0.1:PORT/`）
- 命令：`npm run dev` / `npm run build` / `npm run desktop`（产出 `dist-desktop/`，`target: dir` 免安装绿包）。
- 语言：中英双语，`src/i18n.js`（379 行）以**中文原文为 key**，`zh` 模式直接返回 key —— 漏词条会在英文界面露出中文。

### 5.2 路由与页面

| 路由 | 组件（行数） | 职责 |
|---|---|---|
| `/` | [KeyboardConnector.jsx](src/components/KeyboardConnector.jsx) (550) | 请求设备、选接口、**协议分流总闸**、显示设备信息、通信日志 |
| `/customize` | [KeyboardConfigurator.jsx](src/components/KeyboardConfigurator.jsx) (466) | 旧协议配置壳；`protocolVersion===2` 时直接渲染 `NewProtoConfigurator` |
| `/customize`（新协议） | [NewProtoConfigurator.jsx](src/components/NewProtoConfigurator.jsx) (1207) | 新协议配置：多层、宏、一键密码、灯光、方向键十字布局 |
| `/bt` | [BtConfigurator.jsx](src/components/BtConfigurator.jsx) (637) | 蓝牙无线款配置（QT 协议），支持旋钮槽位 |
| `/keytest` | [KeyTestPage.jsx](src/components/KeyTestPage.jsx) (556) | 纯浏览器按键测试（音效/KPM/缩放），不碰 HID |
| `/mic` | [MicGuidePage.jsx](src/components/MicGuidePage.jsx) (258) | 麦克风款引导：教程视频 + 软件下载 |

支撑组件：[KeyConfigPanel.jsx](src/components/KeyConfigPanel.jsx) (394，旧协议单键编辑)、[ConfigListPanel.jsx](src/components/ConfigListPanel.jsx) (151，本地配置列表)、[BtVirtualKeyboard.jsx](src/components/BtVirtualKeyboard.jsx) (116)、[CableHint.jsx](src/components/CableHint.jsx) (连接页插线动画)。

> 连接页 `/` 顶部有一段「请先用 USB 线连接键盘」的循环动画（`CableHint.jsx` + `index.css` 里的 `yy-*` 关键帧）：线缆从**正上方**垂直下移插入键盘顶部插口 → 插入 → 双环脉冲 → 绿色对勾（实物就是顶部插线）。纯 CSS 实现、无依赖，并遵循 `prefers-reduced-motion`。分镜见 ![插线动画分镜](img/cable-hint-storyboard.png)。
状态：[DeviceContext.jsx](src/context/DeviceContext.jsx)（设备与 protocolVersion 1/2/3、拔出自动清理）、[LanguageContext.jsx](src/context/LanguageContext.jsx)。

> **说明页按设备类型聚焦**：`public/tutorial.html` 支持 `?type=old|new|bt|mic`。不带参数时显示四张设备选择卡；带参数时隐藏无关章节，只保留「通用 + 对应协议 + 型号表/示例」，并插入该类型的「快速上手 4 步」，目录也会自动过滤。三个配置页顶栏的「📖 说明」会自动带 type（`NewProtoConfigurator → new`、`KeyboardConfigurator → old`、`BtConfigurator → bt`），所以客户连上设备后点说明，看到的直接是自己那一代的操作步骤。英文版 `tutorial-en.html` 结构完全一致。

### 5.3 设备接入层

**浏览器路径**
- 过滤器 = 旧协议表 + 新协议表合并（`KeyboardConnector.jsx:15`）：`0x413D:0x553A/0x553B`、`0x8808:0x6600–0x6618`（25 个）、`0x1189:0x8834`、`0x514C:0x8850`、蓝牙双 VID × 7 PID。
- 接口选择两级扫描：`usagePage=0xFF00 && usage=0x01` → `0xffa0` → 任意带 outputReports 的 collection；`open()` 失败会 `close` + 150ms 重试（`KeyboardConnector.jsx:192-216`）。
- 失败分流：Linux 给 udev 规则提示（`public/linux-udev-fix.sh`），其他系统提示"关掉其他配置软件 / 拔插重试"。
- `requestDevice` 返回空时用 `getDevices()` 区分"用户主动取消"与"没插键盘"（`KeyboardConnector.jsx:25-32, 85-91`）。

**Electron 路径（`desktop-main.cjs`）**
- 不用 `file://`：主进程起 http 服务监听 `127.0.0.1` 随机端口（`:67`），把 `dist` 挂到 `/`，带 SPA 回退和路径穿越防护。**localhost 属安全上下文，`navigator.hid` 与 history 路由都能正常工作**，这是整个设计的关键技巧。
- Electron 没有系统级 HID 选择器，必须拦 `select-hid-device` 事件自己选（`:91-115`）：用 `node-hid` 按 `VID + PID + serialNumber` 匹配，优先挑 `usagePage=0xFF00/0xffa0` 的**配置接口**（对应 C# 里的 `mi_03`）。
- ⚠️ 源码明确警告：**不能设 `setPermissionCheckHandler` 返回 true**（`:89`），会跳过设备选择导致 `requestDevice` 返回空数组。
- 外链一律 `shell.openExternal`（`:133-144`），单实例锁（`:155-165`）。

**内嵌宿主环境（踩过的坑，2026-10-17 已处理）**

WebHID 的设备选择框是**浏览器内核提供的系统级 UI**，不是网页画的。因此在这些"第三类宿主"里 `navigator.hid` 存在、但永远拿不到选择框：

| 宿主 | 后果 |
|---|---|
| 微信/QQ/钉钉内置浏览器 | 已由 UA 检测拦截，整页换成"浏览器不兼容" |
| Web GUI 预览面板 / 任意跨域 iframe | 需要 `allow="hid"` 权限策略，否则请求被拒 |
| Electron `<webview>` / `BrowserView` | 无系统选择器，必须宿主监听 `select-hid-device`（这正是 `desktop-main.cjs` 干的事） |

**曾经的缺陷**：这些环境里失败后统一提示"未检测到键盘设备，请插入键盘USB线后重试" —— 把用户往"拔插线"的错误方向带，永远试不出来。

**现在的处理**（`KeyboardConnector.jsx`）：
1. **宿主分类**：`UA 含 Electron/ 且不含 YYWLDesktop` → 「应用内嵌 Electron 宿主」；否则 `window.self !== window.top` → 「iframe」。
2. **Electron 宿主 → 直接拦住连接**：这类窗口里 `window.open` 只会在应用内**再开一个窗口**（实测会让人以为跳出去了、其实还在里面），而网页无权调起系统浏览器。所以不给按钮，改为**显示完整地址 + 「复制地址（去外部浏览器打开）」**，文案明确写"请用 Google Chrome / Edge 打开"。另留一行 `仍要在此窗口尝试连接（不推荐）` 供极端情况。
3. **iframe → 保留「在新标签页中打开」**（普通浏览器里 window.open 是真开系统标签页），同时提供"复制地址"兜底。
4. `NotAllowedError / SecurityError / NotSupportedError` 单独提示"当前窗口不允许访问 USB 设备"。
5. 连续失败 2 次后追加升级提示（覆盖检测不到特征的宿主），链接改为**复制地址**而不是"新标签页"。
6. 所有连接类 toast 统一加 `id`，同类只保留 1 条（此前连点会堆出一屏重复提示）。
7. `index.html` 增加 `nomodule` 兜底：IE/老内核浏览器不再白屏，直接提示换 Chrome/Edge。
8. 自家 Electron 桌面版由 `desktop-main.cjs` 给 UA 追加 ` YYWLDesktop/1.0`，从而**豁免上述拦截**（它实现了 `select-hid-device`，WebHID 可用）。

> 结论：**测硬件一定要用系统 Chrome/Edge 的独立窗口**；应用内面板只能看 UI，这属于宿主能力边界，网页层无法绕过。

### 5.4 三套协议

#### A. 旧协议 — [`hid-service.js`](src/services/hid-service.js) (417) + [`hid-constants.js`](src/services/hid-constants.js) (442)

- 帧：`[reportId(0|3), 长度, …数据]`，**同一报文连发两次**（`hid-service.js:92-97`，历史兼容 hack）。
- 读配置：发 `[0x55]`（10KDZ1 发 `[0xFA,0x08,0x01]`），设备连回若干 64B 报告。
- 灯光：`[0x57, 模式]` 或 `[0x57, zone1, zone2]`；自定义色 `[0x70, G,R,B…]`；延时 `[0x58+键位, 高, 低]`。
- 型号差异全在 `hid-constants.js` 的表里：
  - `DEVICE_MODELS` 26 个型号，字段 `keyCount / dataLen / multiKeyLen / hasRgb / hasDelay / reportId / multiKeyOnly / layout / dualZone`
  - **RGB 模式表 12 组**（A/B/BP/C/D/E/F/G/H/I + 双灯区 G2/I2），同一"第 3 项"在不同型号含义不同 → `getRgbModesForModel()`
  - **LED 下标映射**：12K、DXN 的下拉序号 ≠ 设备值，需 `ledIndexToDevice()/ledDeviceToIndex()` 转换
  - 键码表覆盖 HID 0x04–0x73 + **C# 特有 shifted code 0x95–0xC4**（A→0xAB、1→0x96 等）+ 修饰键 0xE0–0xE7
- 已知陷阱：旧固件把音量 +/− 的 Consumer 码写反了（`音量+ = 0xEA`），新协议才用标准值（`音量+ = 0xE9`）。两套表不能混用。

#### B. 新协议 — [`new-protocol.js`](src/services/new-protocol.js) (1165)

- 帧：**reportId `0x03`，body 固定 63 字节**，`[0]cmd [1]layer [2]keyIdx [3]dataLen [4..]payload [62]XOR(前62字节)`。
- 命令码：

| cmd | 名称 | 要点 |
|---|---|---|
| `0x01` | WRITE_KEY | payload = 9 字节 ActionHeader + 数据，等 ACK（20s） |
| `0x02` | WRITE_MACRO | 分包（`[3]pktIdx [4]total [5]len [6..]`，每包 56B），每包 ACK |
| `0x03` | READ_KEY | 逐键读，兼容设备直接回 `0x08` |
| `0x04` | READ_LAYER | 批量读，≤8 键不走；8s 超时降级逐键 |
| `0x05` | CLEAR_KEY | — |
| `0x06/0x07` | ACK / NAK | ACK 有 4 种格式（启发式匹配）；NAK 状态位：1 校验/2 参数/3 Flash/4 容量/5 忙/6 层校验 |
| `0x08` | READ_MACRO | 多包重组 |
| `0x09/0x0A` | 写/读灯光 | 52B = mode + sleepAllow + reserved + 16×RGB，写完要 `SAVE_LAYER` |
| `0x0B` | **DEVICE_INFO** | keyCount / encoderCount / encoderDCount / layerCount / hardwareVersion / layoutId / backlightType + ASCII 型号名 → **整个分流逻辑的核心** |
| `0x0C` | EXT_DEVICE_INFO | magic `0xA5` + version + len + 32bit capabilities；**也用于 `probeAlive` 判断设备生死** |
| `0x0D/0x0E` | 麦克风信息读/写 | 3 种格式各试 800ms |
| `0x12/0x14` | SAVE_LAYER / SET_ACTIVE_LAYER | saveAll 收尾 |

- 健壮性补丁（都来自线上事故）：`0x0B` 两次重试 + drain；**垃圾值判定**（keyCount=0 或 >16、layerCount=0 或 >16 视为垃圾）+ `_probeKeyCount()` 逐键探测；`saveAll` 每键前 drain、键间 500ms。

#### C. 蓝牙无线款 — [`bt-protocol.js`](src/services/bt-protocol.js) (593)

- 逆向自 `QT9/KEY_PRO`，**无校验和**（写错不会报错，只表现为"键不生效"）。
- 帧：reportId `0x03` + 64B body；V10 与旧版两种记录格式，由 `0xFB` 返回的 `version >= 10` 决定。

| 报文 | 含义 | 响应布局 |
|---|---|---|
| `FB FB FB` | 读设备信息 | `data[1]` 键数、`[2]` 旋钮数、`[3]` 版本、`[4]` 子型号 |
| `FA KeyNum KnNum Layer` | 读整层 | V10: 25键/0旋钮；旧: 15/3 |
| `FA B0 Layer` | 读灯光 | `data[1]` 模式、`data[2..49]` 48B RGB |
| `FD keyNo layer mode …` | 写键 | V10 64B（delay 2B + value，≤18 组）；旧 50B |
| `FE B0 Layer Mode + 48B` | 写灯光 | — |
| `FD FE FF` | 写 Flash 确认 | — |

- 旧版记录字节偏移（`bt-protocol.js:230-265`）：多媒体 `[9]=2, [10..11]`；鼠标 `[9]=1, [10]=mod, [11]=btn, [14]=wheel`；多键 `[10+j*2]=mask, [11+j*2]=value`。
- 键号映射：`1..keyCount` → 槽 0..；**旋钮从 16 起**，每个旋钮占 3 槽（左/中/右）。V10 修饰键用 token `0xF1–0xF8`。

### 5.5 设备分流判定树（**全项目最脆弱处**）

全部集中在 [`KeyboardConnector.jsx:122-382`](src/components/KeyboardConnector.jsx)：

| 顺序 | 判定条件 | 结果 | 位置 |
|---|---|---|---|
| 1 | PID ∈ `0x8842/0x8840/0x8830–33` 且 VID ∈ {0x1189,0x514C} | 蓝牙款 → 直接 `/bt` | `bt-protocol.js:19-27` |
| 2 | 其他蓝牙 PID | alert + 跳 `lybz.html` 下载页 | `:157-163` |
| 3 | 所有 `0x514C:0x8850` 设备都**没有** 0xFF00 但**有** 0x0C | 蓝牙款 → 下载页 | `hid-constants.js:35-44` |
| 4 | `0x0B` 型号名包含 `BT/WIRELESS/BLUETOOTH/蓝牙/无线` | 蓝牙款 → 下载页 | `:283-291` |
| 5 | `0x0D/0x0E` 有响应，**或兜底** `keyCount=5 && layoutId=5` | 麦克风款 → `/mic` | `:294-320` |
| 6 | `0x0B` 超时 → 试 `0xFB`，有响应 | 切 BT handler → `/bt`（6+1 旋钮款） | `:341-353` |
| 7 | `0x0B` 超时但 PID ≠ `0x8850` | **不判蓝牙**，提示拔插 | `:355-360` |
| 8 | `0x0B` 超时 + `probeAlive`(0x0C) 也无响应 | 蓝牙款 → 下载页 | `:363-377` |
| 9 | `0x514C:0x8850/0x8851`（0x0B 正常） | 新协议 | `new-protocol.js:19-22` |
| 10 | `0x8808` / `0x1189:0x8834` | 旧协议（查表或手选） | `hid-service.js:11-29` |

**为什么脆弱**：没有任何一个寄存器级特征能唯一标识设备，全靠"命令超时/有响应/型号名字符串/接口页"这些弱信号组合。源码注释里自己写着"**绝不能单凭一次超时就判蓝牙**"（`:336-338`）。历史上为此连打了 5 个补丁提交。

### 5.6 配置数据模型

| 协议 | 结构 |
|---|---|
| 旧协议 | 单层：`{mode 1-4, modifier, keyCode, mouseButton/X/Y/scroll, mediaCode[4], multiKeys[]}` + `delays[]` + `rgbMode/rgbMode2` + `customColor(2)` |
| 新协议 | `ActionHeader` 9 字节 `[type][flags][rsv][param1 LE][param2 LE][dataLen LE]` + payload；`type` = SIMPLE/MACRO/MEDIA/MOUSE/COMBO；宏 = `[步数][act 0x00按下/0x01松开][keyCode][delay LE16]`；多层用 `allLayerConfigsRef` 缓存 |
| 蓝牙 | `{mode 1/2/3/5, modifierMask, keyCode, mediaCode(16bit), mouse{mod,btn,wheel,behavior}, delay, groups}`；槽位 = keyCount + 旋钮×3 |

本地保存（网页）：`localStorage['yywl_keyconfigs']`，条目 `{id, configName, keyboardId, keyConfigs, rgbMode, customColor, delays, extra, createdAt}`，同名去重，导出为数组 JSON，导入按名字合并跳过重复（[config-storage.js](src/services/config-storage.js):4-104）。
⚠️ **无 schema 版本号、无迁移**，且 `saveAll` 没捕获 `QuotaExceededError`；浏览器版与桌面版 storage 互相隔离。

### 5.7 建议阅读顺序

`hid-constants.js` → `new-protocol.js` → `bt-protocol.js` → `KeyboardConnector.jsx` → `DeviceContext.jsx` → `KeyboardConfigurator.jsx` / `NewProtoConfigurator.jsx` → `desktop-main.cjs`。

---

## 6. 快速配置工具（`quick-config/`）

### 6.1 形态

- **定位（已确认）：内部仓库员工快速配置用，不对外分发。**
- Electron 33.4 + node-hid 3.4 + Vite 6 + React 19；`main = electron.js`（775 行）。
- 打包：electron-builder，`appId com.yyt.quick-config`，产品名「YYWL快速配置」，NSIS 安装包 + 绿包（`dist-electron/`，`app.asar` 约 775 KB）。
- 与网页版的关键差异：**HID 全在主进程**（node-hid 直连），渲染进程只通过 IPC 操作；无路由、无 Context，单窗口 21 个 `useState` + 5 个 `ref`（[App.jsx](quick-config/src/App.jsx) 1519 行）。

### 6.2 IPC 契约（`preload.js:3-49` ↔ `electron.js:257-684`，18 个 handler）

| 分组 | 方法 |
|---|---|
| 状态/连接 | `hid:get-status`、`hid:scan`、`hid:connect`、`hid:disconnect` |
| 设备/数据 | `hid:readDeviceInfo`、`hid:readAllKeys`、`hid:saveAll`、`hid:setOldModel` |
| 灯光 | `hid:readLedLayer`、`hid:writeLedLayer` |
| 本地配置 | `config:list / save / delete / rename / setAuto` |
| 在线更新 | `update:getVersion / check / apply` + 事件 `update:available`、`update:progress` |

事件回推：`hid:device-status`、`hid:progress`。

### 6.3 协议调度

- 白名单过滤（`electron.js:39-63`）：排除 usagePage `0x01`（键盘自身），优先 `0xFF00` 再 `0xFFA0`。
- 启动即连、**每 2 秒重扫**（`electron.js:120-128, 756-762`）。
- 分派与网页同构：经典蓝牙 PID → bt；`0x514C` 先 `0x0B` 判新协议，超时才探 Qt，仅 `0x8850` 用 `probeAlive` 二次确认；其余走旧协议 + `detectOldModel`（`electron.js:155-238`）。
- `buildDeviceInfo` 把三协议字段归一化；bt 的 `totalSlots = 键数 + 旋钮×3`，只有 V10 才是 3 层（`electron.js:72-118`）。
- 超时阶梯：ACK 5s、SAVE 10s、ACTIVE/LED 8s；旧协议无 ACK。

### 6.4 在线增量更新（`electron.js:556-693`）

1. 启动 3 秒后拉 `https://key.itytsoft.com/ws/QuickConfigUpdate/version.json`；
2. semver 逐段比较 → 有新版则按清单下载到 `userData/updates/<ver>/`，**逐个 MD5 校验**；
3. 生成 `apply-update.bat`：`tasklist` 轮询等本进程退出 → `copy /Y` 覆盖 `win-unpacked` 下的相对路径 → 删临时目录 → 重启 exe；
4. `execFile` detached 后 800ms `app.quit()`。
5. `deploy-update.js` 负责把这些文件推到服务器（**凭据从 `FTP_PASS` 环境变量或 `quick-config/.env` 读取，源码里已无明文口令**；2026-10-17 已轮换密码，旧口令在服务端已失效）。

当前版本 `1.0.1`。

### 6.5 与主应用的关系

- **没有任何跨目录 import**：`quick-config/protocols/{new,bt,old}-protocol.js` 是从 `src/services/*` 手工移植的 ESM→CJS / WebHID→node-hid 副本。
- 型号表、媒体键、RGB 模式表整段重复（`old-protocol.js:23-62` vs `hid-constants.js:82-127`）。
- **根网页版更完整**：`new-protocol.js` 1165 行（含 READ_LAYER 批量+降级、麦克风 0x0D/0x0E、ACK drain 重试）vs quick 572 行（`READ_LAYER` 常量是死码）。
- **quick 独有**：连接后自动下发匹配配置、在线增量更新、三协议统一主进程调度。

### 6.6 已确认缺陷

| 级别 | 问题 | 位置 |
|---|---|---|
| **P0** | `mode1Name` **未定义**（同名变量叫 `modeName`）→ 旧协议只要带灯光保存就抛 `ReferenceError`；键已写入但 UI 报错 | `quick-config/protocols/old-protocol.js:447,449,452`（定义在 `:439`） |
| P1 | 旧协议按键延时没有回写（有 `setKeyDelay` 但 `saveAll` 不调用） | `old-protocol.js:422-432` |
| P1 | 错误分支先 `add` 又被 `disconnectDevice` 清空 → 2 秒定时器**无限重连并重复弹错** | `electron.js:202-204, 251` |
| P2 | 更新清单 `f.path` 无路径穿越校验，且只校验 MD5 | `electron.js:641-645, 664-665` |
| P2 | 装到 `Program Files` 时 bat 覆盖 asar 会失败并 `pause` | `electron.js:655-667` |
| P2 | 死代码：`getModelName`、`hid:readDeviceInfo`、`config:rename`、`old` 导出的 `MEDIA_KEYS/MOUSE_BUTTONS`、`hasDelay` | 多处 |
| P3 | 残留 `debug.log`（148 KB）、`electron_err/out.log`、`debug-hid.js`、`deploy-update.js` 全部入库 | 仓库根 |

---

## 7. 历史资产之一：`yywlkey`（老 USB 款，C#）

### 7.1 工程形态

- **只有一个工程**：`yywlKey.sln` + `Hid_Common/yywlKey.csproj`。**不存在** yywl8Key / yywl9Key / yywl12Key 独立工程——8/9/12 键是同一程序里的 `K8Form/K9Form/K12Form`。`.vs/` 里残留这些目录名，是更早"一型号一工程"时期的痕迹。
- `.NET Framework 4.8`、`WinExe`、**仅 x86**、`RootNamespace=HID_SIMPLE`、`AssemblyName=yywlKey`、`AssemblyVersion = 3.7.9.0`。
- 依赖：**DSkin 16.6.3.30**（HintPath 是绝对路径 `D:\【4.0】DSkin20240318142543\DSkin.dll`，**本机恰好存在，所以能编译**）、HidLibrary 3.3.40、System.Data.SQLite.x86 1.0.113.0、EntityFramework 6.4.4 + Theraot.Core（**这两者是死依赖**，源码里 `DbContext`/`System.Data.Entity` 零命中）。
- 规模：74 个 `.cs`、约 **50,500 行**。组织方式是「`BaseKeyForm` 基类 + 20 余个型号窗体 + `CLS/` 协议适配」，不是类库复用。

### 7.2 HID 通信层（注意：`ClassHid.cs` 是死代码）

- **`CLS/ClassHid.cs` 全仓零引用**，是 Win32 示例（`hid.dll`/`setupapi.dll`/`CreateFile`），命名空间 `Hid_test`，且自身有 bug（`USBDataRead` 是死循环、`CloseHandle(int)` 参数类型错误）。**不要拿它当协议参考。**
- 真实通信全走 HidLibrary：`HidDevices.Enumerate(vid[,pid])` → `GetDevice(path)` → `OpenDevice()` → `ReadReport(cb)` / `WriteReport(report, ms)`。
- 老协议：**不设 ReportId**、固定 64 字节报文、**首字节自描述长度**（`sendtemp[0]=byData.Length`）、写超时 500 ms、发送前 `Sleep(20)`、**关键命令连发两遍**（掩盖无 ACK 的脆弱性）、失败即弹框中止、无协议级重试。
- 接收：只在 `Length==64 && Data[0]!=0` 时解析并立即重挂 `ReadReport`；断线靠 **500 ms 轮询重连**。
- 设备发现四代并存：`0x413D`+`553A/553B` 的 mi_03 接口用 `"55"` 探测 → `0x8808`+`6600…6618` 直接判型号 → `0x1189/0x8834` → 新协议 `0x514C`（`NewProtoHelper.cs`，reportId 0x03 + XOR + ACK/NAK）。

### 7.3 老协议命令表（**这就是网页版兼容老款的"规格书"**）

| 命令 | 载荷 | 含义 |
|---|---|---|
| `0x55` | — | 回读全部键位（**连发两遍**） |
| `0x56` | — | 进入 Bootloader / 烧录模式 |
| `0x57` | 灯效索引 | 灯效模式 |
| `0x70` | **G,R,B（不是 RGB 序）** | 自定义颜色 |
| `0x71` | G,R,B ×3 | 三灯独立颜色（3KDZ15） |
| `0x58+i` | delayHi, delayLo | 单键间隔（大端 16 位） |
| `FA,08,01/02` | — | 10 键定制款切层/读层 |
| `FD` | 键位,层,模式,时延×2,0×3,长度,[标志,键码]×N | 10 键定制款写键 |

- 应答：`data[0]=len`（len 由 `buding.cs:244-317` 按型号给，如 8K=0x0F、12K=0x0A）→ `data[1]`=键号、`data[2]`=模式（01 键盘/02 鼠标/03 多媒体/04 多键/FF 空）。
- 另有 `Data[0]=0x02`+`[1]=0x08/0x63` 灯效帧、`Data[0]=4`+`[1]=0x64` 自定义色帧、`Data[0]=3`+`[1]=0x58+i` 间隔帧。
- 灯效索引 0–14 = 关闭 / 流水1-3 / 按下亮(红绿蓝黄青紫白) / 放射 / 常亮 / 台灯 / 自定义。
- 键码：110 个 HID usage（0x00、0x04–0x73、0xEF）+ **Shift 伪码 0x95–0xC4**（`0x35→0x95`=`~` … `0x1D→0xC4`=`Z`）+ 21 条 Consumer（`04,usageLo,usageHi,00`）。
- 新协议在 C# 侧也有完整实现（`NewProtoHelper.cs`，16 条命令、9B ActionHeader、56B 宏分包、LED 52B、ACK/NAK 状态名）——**可作为网页版的交叉验证基准**。

### 7.4 数据模型与存储

- 老协议**没有键位结构体**：内存里是 `sendData_list`（每键一条逗号分隔十六进制串，首字节=键号）+ `yc_list`（间隔）+ `list_multikey` + 当前选中项。
- 层：老协议**只有 10 键定制款**支持 2 层；新协议层数来自 `DeviceInfo.LayerCount`。
- 落盘：**写入即生效，没有独立提交命令**。
- 本地配置：SQLite `%exe%\rc\keydata.db`，单表 `yt_keyconfig`（id / HidData / RgbData / CreateDate / configName / KeyboardID / yclist / customColor）。这就是网页版 `config-storage.js` 注释里"替代 C# 项目中的 SQLite `yt_keyconfig` 表"的出处。
- **没有任何 json/xml/ini 导出**（全仓无 `SaveFileDialog`/`XmlSerializer`/`StreamWriter`）。

### 7.5 界面结构

`Program.Main` → `DeviceSelectForm`（单实例检测 + 全局异常写 `errorLog.txt`）→ 后台线程枚举填表 → `btn_configKey` **按型号字符串分派到 20 余个窗体**；型号不确定时开 `CategorySelectForm`（`rc\*.jpg` 产品图卡片）。
配置窗体统一继承 `BaseKeyForm`，实现 `virtual handleConfig(byte[])`。
新协议专用窗体 `NewKeyConfigForm.cs`（2347 行，全代码构建 UI，宏录制捕获 KeyDown/KeyUp）。
DSkin 是第三方 DirectUI 皮肤库，代码里多处注释在**绕开**它的鼠标拦截（例如用独立子 Form 托管 ListView、用 GDI+ 自绘进度条"彻底绕过 DSkin 主题渲染"）——这也是根目录那几份 `*_Fix.txt` 笔记的由来。

### 7.6 SoftUpdate（可平移的方案）

- 地址 `https://key.itytsoft.com/ws/SoftUpdate/version.json`；版本取 `Assembly.GetName().Version` 四段比较；**JSON 手写解析**，不引 Newtonsoft。
- 下载到 `%TEMP%\yywlKey_update_<ticks>`，8 KB 流式 + 进度 + 取消。
- 替换：生成 **UTF-8 带 BOM** 的 `update.bat`（让 cmd 正确识别中文路径）→ `tasklist|find` 轮询等主进程退出 → 逐文件 `copy /Y` → `start` 重启 → `rd /S /Q` 清临时 → `del "%~f0"` 自删。
- 已知缺陷：**只覆盖文件，无签名/哈希校验**（`size` 字段解析了但没用）。

### 7.7 版本线索

`AssemblyInfo = 3.7.9.0`；bin 产物：`bin\Release=3.7.9.0`、`bin\Release-JA-Test=3.7.8.0`（日文测试）、`bin\yywlKey-V3.7.6\=3.7.7.0`（目录名落后一版）、`bin\Debug=3.7.5.0`。
三个绿包都是 31 个文件 / 解压 44,862,992 字节的**同构包**，只有目录名不同 → 与源码对得上的是 **3.7.9**。
网站上下载的 `yywlKey-V3.7.9-green.zip` 就是这个。

### 7.8 可复用价值 & 反例

**值得抄**：PID→型号→窗体的路由表、`buding.cs` 的每型号帧长、110 个 HID usage + Shift 伪码、`0x70` 是 **G,R,B** 序、`0x55` 连发两次 + 300ms×3 的初始化序列、version.json + bat 自替换更新方案。
**不要抄**：`ClassHid.cs`、EF6/Theraot 死依赖、无 ACK 却靠"发两遍"、无导入导出、注释与代码不符（`K1Form.cs:453` 注释"0x59 起"实为 `0x58`）。

---

## 8. 历史资产之二：`QT9`（老蓝牙款，Qt）

### 8.1 工程形态

- `KEY_PRO/KEY_PRO.pro`：`TARGET = MINI_KEYBOARD`、`QT += core gui widgets`、`CONFIG += c++11`、`RC_ICONS = logo3.ico`、`win32: LIBS += -lhidapi`、4 份翻译（`lanague_cn/en.ts`）。
- kit：**Desktop Qt 5.14.2 MinGW 32-bit**（`qt.qt5.5142.win32_mingw73_kit`）。历史构建路径还写着 `F:/CX_Leaf/QT/QT9/` —— 换机器后工程路径已失效。
- 规模：74 个源码文件、约 16.3 万行（含生成的 `ui_*.h`）。**`widget.cpp` 一个文件 11,970 行 / 645 KB**，`dialog2.cpp` 1,067 行，其余几乎是空壳：

| 文件 | 行数 | 职责 |
|---|---|---|
| `main.cpp` | 85 | 入口、`language.ini` 语言选择、QTranslator |
| **`widget.cpp`** | **11,970** | 全部核心：枚举/连接、协议读写、数据模型、30+ 型号布局 |
| `widget.h` | 295 | 声明 + 224 项键值表 `m_allbasic`/`m_order` |
| `dialog1.cpp` | 158 | `0xFB` 无响应时手动选型号（6 款图） |
| `dialog2.cpp` | 1,067 | 旧版配置窗体（60 键/50B 记录），**已编译但从未实例化** |
| `dialog3.cpp` / `form1.cpp` | 0 | 空文件残留 |
| `hid.c` | — | 官方 hidapi Windows 后端（SetupAPI + CreateFileA） |

### 8.2 三个构建变体的真相

`release/`、`release升级/`、`release工厂版本/release/` 三个目录各有一个同名 `MINI_KEYBOARD.exe`：

| 变体 | 大小 | 时间 |
|---|---|---|
| `release\` | 2,477,056 B | 2026-09-09 |
| `release升级\` | 2,081,280 B | 2023-11-20 |
| `release工厂版本\release\` | 2,407,424 B | 2025-04-07 |

对三份 exe 做字符串比对：**27 条 Qt 元对象/槽签名完全一致，UTF-16 中文 UI 字符串零差异**。能确认的只有：普通版含 `language.ini` 支持（`main.cpp:16`），升级/工厂版不含该串；升级版资源是旧版本；`main.o` 大小不同。
👉 **结论：「升级版/工厂版」的功能差异在产物层面无法证明**，源码里也没有对应分支，最可能是编译期宏或资源替换。接手时**不要把这三个目录当成三套功能**。

### 8.3 通信层（纯 hidapi，无串口/BLE）

- 写 65 B（`buf[0] = reportId 0x03`），读 64 B（不含 reportId）。
- VID：`0x1189`，后来因为「客人投诉和弘基 VID 相同」补了 `0x514C`。
- PID 轮询表：`{0x8842, 0x8840, 0x8830, 0x8831, 0x8832, 0x8833, 0x8850, 0x8851}`。
- 100 ms `QTimer` 轮询：两轮 VID 枚举、要求 `interface_number == 0`、`hid_open_path` 打开、每 tick 重新 enumerate 判掉线。
- **帧结构：定长报告，无长度字段、无校验、无序号、无 ACK**。读靠"命令里写死条数 + 固定延时/超时"对齐，无分包，一层最多 60 条逐条发。这就是网页版 `bt-protocol.js` 也"没有校验和"的原因。

### 8.4 命令表

| 命令 | 线序 body | 说明 |
|---|---|---|
| 读设备信息 | `FB FB FB` | 回 `[2]`键数 `[3]`旋钮数 `[4]`版本（≥10 为 V10） `[5]`子型号，10 ms 超时 |
| 读按键 | `FA KeyNum KNNum Layer(1..3)` | V10 用 25/0，旧款 15/3 |
| 读灯光 | `FA B0 Layer(0..2)` | 回 `[1]`=模式、`[2..49]`=48B RGB |
| 写按键 | `FD keyNo layer mode behavior count` + 18×(延高,延低,值) | 只写被标记修改的键 |
| 写灯光 | `FE B0 layer mode` + 48B | 三层各发一次 |
| 写 Flash | `FD FE FF` | 每层后 `msleep(200)` |
| 设型号 | `FC FC keys knobs sub` | 16 种型号 |
| 升级 | `EF EF` | 交固件自举，软件不做传输 |
| 清 Flash | `ED ED` | 已注释 |

- 多媒体 = `m_order[41..81]` 两字节小端；鼠标写 `[8]=mod [11]=btn [14]=X [17]=Y [20]=wheel`，抖音/划屏类另置 `[4]=0x04`；修饰符 token `F1..F8`。

### 8.5 数据模型

- **3 层 × 60 槽**（`PHY_KEY_Value[3][60][65]`），0 号弃用。键号即按钮号：K1–K15 普通键，**K16–K27 是 4 个旋钮的左/中/右**。
- **旋钮固定从 16 起**：旋钮1=16/17/18，旋钮2=19/20/21 —— 这正是网页版 `16 + (idx - keyCount)` 那个魔数的来源。
- V10 记录 64 B：`[0]=FD [1]=keyNo [2]=layer [3]=mode [4]=behavior [5]=组数 [6+3j]/[7+3j]=延时高低(BE) [8+3j]=值`；旧协议 50 B：`[9]=组数 [10+2j]=掩码 [11+2j]=值`，延时走 `[4][5]`。
- `mode`：1 基础/功能/Procreate、2 多媒体、3 鼠标、5 延时、8 灯光页。
- **无 ini/json/自定义二进制导入导出**：配置只在内存，点「确定」直接写设备 Flash。

### 8.6 升级与工厂模式

- 升级按钮只发 `EF EF` 就结束，后续由固件自己完成；`UPDATA_BT` 默认隐藏。
- 源码里唯一"工厂"能力是 `Set_Keyboard_Ver()` 的 16 个型号按钮 + `0xFC` 写型号，**但构造函数里这行调用被注释了**，正式版看不到。
- 客订差异靠编译期 `KD_Ver_Infor`（0 公共 / 1 蓝工 / 2 阿壹）。
- **没有任何授权、序列号、加密校验逻辑**。

### 8.7 与网页版 `bt-protocol.js` 的对照（**重要：已验证一致，也有 6 处漂移**）

✅ **已复刻且与 C++ 一致**：VID/PID 表、reportId 0x03 + 64B、`0xFB` 字段序（JS `data[1..4]` = C++ `Rec[2..5]`）、`0xFA` 的 25/0 与 15/3 两种读法、写灯/写键/Flash 布局、F1–F8 token、鼠标 8/11/14/17/20、多媒体小端。
其中那条容易搞错的注释**是对的**：「灯光模式在 `data[1]` 而非 `data[2]`」—— C++ 在 `Rec_buf[2]` 取模式，而 WebHID 输入报告不含 reportId，所以 JS 的 `data[1]` 正好对位。

⚠️ **未复刻**：`0xFC` 写型号、`0xEF` 升级、`0xED` 清 Flash、旧协议独立读旋钮、V10/旧版 UI 状态机。

❗ **行为漂移（建议逐个核对硬件后再决定改哪边）**

| # | C++ 原版 | 网页版 |
|---|---|---|
| 1 | 清空按键只清内存、**不置修改标记、不下发** | `clearKey` 是新语义（会下发） |
| 2 | 3/4 个修饰键组合时**组数字段只 `+2`**，实际写了 3/4 组 | 按位全展开，可能比原版多写 |
| 3 | 鼠标写满 5 组但组数字段固定 4 | 写 5 |
| 4 | 划屏类仅 `version >= 11` 才显示 | 恒定提供 |
| 5 | 读回按顺序落位、忽略返回的 keyNo | 按 `data[1]` 落位（**更稳**，应保留） |
| 6 | **每层各发一次 Flash** | `saveAll` 末尾只发一次 |

### 8.8 风险与遗留

- `main.cpp` 用 `QString::fromUtf8` 读 `language.ini` → 用记事本存成 GBK 必乱码；且文件值 `ch` 不在白名单里，只靠默认 `true` 兜底。
- `interface_number != 0` 时 `hid_info` 会变成 `nullptr`，随后 `hid_open_path(hid_info->path)` **有空指针风险**。
- 老协议 `hid_read` **阻塞无超时** → 设备半死会卡死 UI。
- 76 处 `qDebug` 在 release 版照打（含逐字节打印按键数组）。
- `release/` 里放着 `msvcr100d.dll`（Debug CRT）；`dialog3`/`form1` 是 0 字节空文件；`ui_*.h`、`moc_*.cpp` 大量残留。

---

## 9. 核心资产：设备型号总表

| 型号 Key | 中文名 | 键数 | dataLen | 多键上限 | RGB | 延时 | 特殊 |
|---|---|---|---|---|---|---|---|
| `1K` | 1键小键盘 | 1 | 0x35 | 50 | ✓ | ✓ | — |
| `2K` / `2K-mini` | 2键 / 迷你 | 2 | 0x35 | 50 | ✓ | ✓ | — |
| `3K`–`6K` | 3~6 键 | 3~6 | 0x12 | 15 | ✓ | ✓ | — |
| `7K-noled` | 7键(无灯) | 7 | 0x11 | 15 | ✗ | ✗ | — |
| `7K` | 7键 | 7 | 0x11 | 15 | ✓ | ✗ | — |
| `8K` / `8K-new` | 8键 | 8 | 0x0F / 0x0C | 12 / 9 | ✓ | ✗/✓ | — |
| `9K` | 9键 | 9 | 0x0D | 10 | ✓ | ✗ | — |
| `12K` | 12键 | 12 | 0x0A | 7 | ✓ | ✗ | LED 下标非线性 |
| `DXN` | 单旋钮 | 1 | 0x12 | 15 | ✓ | ✗ | 4 种灯光；LED 下标 12/13/14 |
| `2KPlus` | 2键Plus | 5 | 0x12 | 15 | ✓ | ✓ | `layout:pad` + 双灯区 |
| `3KPlus` | 3键Plus | 6 | 0x12 | 15 | ✓ | ✓ | `layout:pad` + 双灯区 |
| `FOOT` | 脚踏开关 | 1 | 0x35 | 50 | ✗ | ✗ | — |
| `4K-side` / `-new` | 4键侧插 | 4 | 0x12 | 15 | ✓ | ✗ | — |
| `FXJ` | 方向键 | 4 | 0x12 | 15 | ✓ | ✓ | — |
| `DIY10K` | DIY 10键 | 10 | 0x0A | 7 | ✓ | ✗ | — |
| `xnAnd4K` | 旋钮+4键 | 7 | 0x10 | 12 | ✓ | ✗ | `layout:knob` + 双灯区 |
| `8KDZ6` | 8键开关款 | 8 | 0x10 | 15 | ✓ | ✓ | 只支持多键模式 |
| `5K-touch` | 5键触摸 | 5 | 0x12 | 15 | ✓ | ✓ | — |
| `3KDZ15` | 3键定制 | 3 | 0x12 | 15 | ✓ | ✓ | 16 种灯光（B+） |
| `10KDZ1` | 10键定制 | 8 | 0x15 | 20 | ✗ | ✓ | **reportId=3**，只支持多键 |
| `AC632N` | 版本2.0（新协议） | 动态探测 | — | — | ✓ | — | keyCount/旋钮/层全部 0x0B 动态读 |
| 蓝牙 V10 / 旧版 | — | 0xFB 读 | — | — | ✓ | — | 旋钮从槽位 16 起 |

---

## 10. 技术债与风险清单

### P0（会直接伤客户）

1. ✅ **已修复（`676a93c`）** · quick-config 旧协议灯光保存必崩：`mode1Name` 未定义 → `ReferenceError`（`quick-config/protocols/old-protocol.js:447/449/452`）。键已下发但界面报错，用户以为失败会重复保存。
   *修复方式：统一为已定义的 `modeName`。已用 5 种型号（8K/4K/2KPlus/3KPlus/xnAnd4K）跑运行时测试，全部正常下发 `0x57`+`0x70`。*
2. **设备分流靠弱信号**：任何固件改动都可能把 USB 款误判成蓝牙款、跳去下载页（`KeyboardConnector.jsx:277-382`）。**建议给新固件加一个明确的协议版本寄存器/字符串**，这是根治办法。
3. **蓝牙协议无校验和**：写错不报错，只表现为"键不生效"，客户会认为软件坏了。

### P1（会丢数据 / 难以维护）

4. ✅ **已修复（`676a93c`）** · **新协议多层配置存不下也读不回**：`NewProtoConfigurator.jsx:847` 传的是 `layers={allLayerConfigsRef.current}`，但 `ConfigListPanel` 的 props 里**根本没有 `layers`**（`ConfigListPanel.jsx:7`，全文 0 次引用）→ 这个 prop 被静默忽略，多层数据从未进过存储；而读回分支 `NewProtoConfigurator.jsx:710-717` 又只认 `loaded.layers`。蓝牙款靠 `extra={{layers, led}}`（`BtConfigurator.jsx:470`）绕过了，新协议没有。
   *修复方式：`ConfigListPanel` 新增 `layers` 参数，存盘时合并进 `extra.layers`，读回时回传 `layers`。已用 localStorage 往返测试验证 3 层配置完整存回，且蓝牙款 `extra` 路径与"无多层"旧行为均未受影响。*
5. `config-storage.js` 的 `addConfig/updateConfig` 没解构 `rgbMode2/customColor2` → 双灯区配置读回恒为 0（**仍未修**，调用方 `ConfigListPanel.jsx:22,42` 已在传参）。
6. ✅ **已修复（`676a93c`）** · `new-protocol.js` 的 `_drain()` 清空 `_waiters` 却不 resolve/reject（`:529-535`）→ 被清掉的 await **永久挂起**。
   *修复方式：逐个 `reject(new Error('Response discarded by drain'))`。已用运行时测试验证：挂起的 await 在 132ms 内被拒绝，不再永久等待。*
7. **协议代码三份副本**（网页 / quick-config / 两套原生），已经漂移（`BT_PIDS` 一处 7 项一处 8 项）。
8. **蓝牙协议存在 6 处与 C++ 原版的行为漂移**（见 §8.7），其中"每层各发一次 Flash vs 只发一次""修饰键组数字段"两项可能影响固件写 Flash 的行为，需上机验证。
9. **无任何测试**：没有单测、没有协议回放测试，验证全靠真实硬件。

### P2（工程卫生 / 可维护性）

10. 仓库把 Qt 构建产物、NuGet 包、`.vs/` 提交了 → `.git` 407 MB。
11. 没有 git CLI 可用 → 当前**无法提交**。
12. 前端无 TypeScript、无 schema 版本；`localStorage` 写入未捕获配额异常。
13. 巨型组件：`NewProtoConfigurator` 1207 行、`widget.cpp` 11,970 行、`App.jsx`(quick) 1519 行。
14. 重复实现：虚拟键盘布局 3 份、`Browser→HID` 映射 2 份、`MEDIA_KEYS`/`KEYCODE_LABELS` 近似 2 份。
15. 魔法延时遍地（20/100/150/200/500/800/1500/2000/5000/8000/20000 ms），全部硬编码。
16. 版本号硬编码：下载链接 `V3.7.9` 写死在三处组件里。
17. 编码混乱：`.txt` 笔记为 GBK（已乱码），源码 LF/CRLF 混用。
18. 两条升级链路都**没有签名/哈希校验**：C# `update.bat` 只覆盖文件；quick-config 的 bat 只校验 MD5 且清单路径无穿越校验。
19. 构建不可移植：C# 依赖 DSkin **绝对路径** HintPath；Qt 工程的历史构建路径是 `F:/CX_Leaf/QT/QT9/`，换机器即失效。
20. 老代码里的确定性隐患：QT9 `hid_info` 空指针路径、`hid_read` 阻塞无超时；C# `ClassHid.cs` 死循环 + 参数类型错误（幸好零引用）。

---

## 11. 接手建议路线

### 第 1 天：把"能改"变成"能验证"

1. ✅ **已完成** — 装 Git（`C:\Tools\PortableGit` + 用户 PATH），`git status` 核对：工作区干净，已提交 2 个 commit 并自动推送到 gitee。
2. ✅ **已完成** — `npm run build` 通过（6.4s），`npm run lint` 可运行（历史遗留 260 个 lint error，与本次改动无关）。
3. ✅ **已完成** — 清理 `dist-desktop`（385 MB）并从版本库移除；`.gitignore` 补 `dist-desktop/`、`dist-electron/`，移除误伤的 `*.sln`。
4. ✅ **已完成** — 修 P0-1（`mode1Name`）、P1-4（多层配置）、P1-6（`_drain`）。

### 第 1 周：把协议层收敛

5. **抽出共享协议内核**：`packages/protocol-core`（纯 JS，无 DOM 无 node-hid），网页与 quick-config 都 `import` 它，各自只保留传输层（WebHID / node-hid）。这一步能一次性消灭三份副本和 `BT_PIDS` 不一致。
6. 补**协议帧的单测**（构造 → 序列化 → 断言字节），用最近 53 次提交里改过的帧做回归样本。
7. 把 `KeyboardConnector` 的分流判定抽成纯函数 `classifyDevice(info, descriptors)` + 一张决策表，可单测、可打印诊断日志。

### 第 1 个月：把体验与交付补齐

8. 给配置加 **schema 版本号 + 迁移函数**（`configVersion: 1`），修 P1-4/P1-5 的丢字段问题。
9. 把 `NewProtoConfigurator` 拆成 `useDeviceConfig` / `useMacroEditor` / `LayerTabs` / `LightPanel`。
10. 统一"下载专用软件"的兜底逻辑，改为**可配置的能力开关**而不是硬跳转。
11. 补一个**诊断页面**：把 0x0B/0x0C/0xFB 的原始字节、耗时、判定结论可视化 —— 现在这些只存在于 `console.log`，客服提问题时无法让客户回传。
12. 老软件（C#/Qt）转为"只读档案"：把两套协议表 + 型号表抽成文档，源码不再演进。

---

## 12. 已确认的决策（2026-10-17，来自项目负责人）

| 事项 | 结论 | 对开发的影响 |
|---|---|---|
| **`QT9` 是否维护** | **不维护、不编译，仅作参考源码** | 本机不需要装 Qt；Qt 构建产物（`build-KEY_PRO-*`、各 `release/` 里的 DLL/exe）属纯冗余，**可择机清理**（仍在 git 历史里，可恢复） |
| **硬件路线** | **长期方向是新协议（AC632N）**，新型号优先新协议；但**已售出的板子必须继续可用** | 旧协议 + 蓝牙协议在可预见的未来**不能删**；任何重构都必须保留三协议兼容层，`hid-constants.js` 的 26 型号表是硬约束 |
| **`quick-config` 定位** | **内部仓库员工快速配置用**，不对外分发 | 不需要代码签名/安装包美化；但 `deploy-update.js` 里的 FTP 明文口令仍建议移到环境变量（内部工具也会泄露到离职人员手里） |
| **`dist-desktop/`（385 MB）** | **已清除**（2026-10-17 提交 `a1ad44d`） | 该目录 73 个文件已从版本库移除，`.gitignore` 已加 `dist-desktop/`、`dist-electron/`；需要时 `npm run desktop` 重新生成 |
| **Git 工具链** | **已修好**（2026-10-17） | 之前 `git` 只是**没装/不在 PATH**，图形客户端自带的是便携版。现安装于 `C:\Tools\PortableGit`，已写入用户 PATH，并发现仓库带 `post-commit` 自动推送钩子 |
| **FTP 凭据** | **已改为环境变量读取**（2026-10-17） | 源码不再含明文口令：优先 `FTP_PASS` 环境变量，其次 `quick-config/.env`（已 gitignore，附 `.env.example` 模板）。**密码已在服务端轮换，旧口令失效** |

**仍需你拍板的**：

1. **Qt 构建产物要不要一起清掉？** QT9 目录下 437 个被跟踪文件里有 5 份 `opengl32sw.dll`（各 15 MB）、`Qt5Gui.dll`(9.4 MB)、`Qt5Widgets.dll`(8.7 MB) 等，约 200 MB。既然不编译，这些都可以像 `dist-desktop` 一样从版本库移除（历史仍在）。
2. **`.git` 已有 407 MB 历史包袱**：删文件只影响后续提交，历史里的 180 MB exe 还在。要彻底瘦身需要 `git filter-repo` 重写历史 + 强推，**属于破坏性操作，需你确认后再做**。
3. **要不要现在就做 §11 的协议内核抽取？** 这是把三份副本收敛成一份的关键一步，也是唯一能根治"改一处忘两处"的办法。

---

## 附：一句话总结

> 这是一个**协议逆向驱动**的硬件配套软件项目：三套协议、五种上位机形态、二十多个型号，全部收敛在两张常量表和一条脆弱的设备分流链上。功能已经齐了，**下一步的价值不在加功能，而在把协议层从"三份副本 + 弱信号猜测"变成"一份内核 + 可测判定"**。
