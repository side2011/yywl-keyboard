# 桌面版打包与发布说明

> 桌面版 = **把整个网页打包进 Electron**，双击即用、离线可跑、不需要浏览器。
> 客户在内网/无外网环境下用这个；外网客户直接用网页版 `https://key.itytsoft.com/`。

---

## 1. 三条命令

```bash
# Windows 免安装绿色版（打 zip，适合内网直接发） —— 本机可打
npm run desktop:win

# macOS 版 —— 只能在 macOS 上打（Windows 打不了，见 §2）
npm run desktop:mac

# Linux AppImage —— 需要 Docker（electron-builder 靠容器产出 Linux 包）
npm run desktop:linux
```

产物统一落在 `dist-desktop/`：

```
dist-desktop/
├─ YYWL键盘配置工具-<version>-win.zip      ← Windows 发布包
├─ win-unpacked/                           ← 解包目录（调试用，可直接双击 exe）
├─ YYWL键盘配置工具-<version>-mac.zip      ← macOS（在 Mac 上打才产出）
└─ YYWL键盘配置工具-<version>.AppImage     ← Linux（有 Docker 才产出）
```

---

## 2. 跨平台的硬限制（重要）

| 目标 | 能否在 Windows 上打 | 说明 |
|---|---|---|
| Windows x64 | ✅ 可以 | 本机直接出包 |
| macOS | ❌ **不能** | Apple 的 dmg/zip 需要 macOS 上的 `hdiutil`/签名工具链；electron-builder 官方明确不支持在 Windows 上产出 mac 包 |
| Linux | ⚠️ 需要 Docker | 装了 Docker 后 electron-builder 会自动起容器编译；本机目前**没装 Docker** |

**要出 macOS / Linux 包的三条路**：
1. 找一台 Mac 跑 `npm run desktop:mac`；
2. 在 Linux 机器 / WSL 里装依赖后跑 `npm run desktop:linux`；
3. 用 GitHub Actions 的 `macos-latest` / `ubuntu-latest` runner（最省事，但要先把仓库同步到 GitHub）。

> 三个平台的**代码是同一份**，`desktop-main.cjs` 里没有平台相关分支，跨平台只是"在哪台机器上打"的问题。

### 本机为什么必须关掉 exe 元数据编辑

本机打 Windows 包时用的命令带了 `--config.win.signAndEditExecutable=false`，原因是：

```
errorOut=ERROR: Cannot create symbolic link : 客户端没有所需的特权
  winCodeSign\894511235\darwin\10.12\lib\libcrypto.dylib
```

electron-builder 为了改 exe 图标/版本信息，会下载 `winCodeSign` 包；这个包里含 **macOS 的符号链接**，解压时需要"创建符号链接"特权（只有管理员或开启"开发者模式"才有）。本机没有该权限 → 整包失败。

**代价**：本地打出来的 exe 是 Electron 默认图标、没有版本信息。
**解法**：GitHub 的 `windows-latest` runner 是管理员权限，workflow 里**不加**该开关，产物就会带上图标与版本号（见 §3）。

---

## 3. 用 GitHub Actions 出三平台包（推荐）

本地只能出 Windows；macOS / Linux 交给 GitHub 的 runner 最省事。

### 3.1 一次性准备：把仓库推到 GitHub

```powershell
# 1) 在 https://github.com/new 新建空仓库（不要勾选 README/gitignore）
#    假设仓库地址是 https://github.com/<你的账号>/yywl-keyboard-app

# 2) 添加远程（origin 保留给 gitee，二者可共存）
git remote add github https://github.com/<你的账号>/yywl-keyboard-app.git

# 3) 推送（GitHub 已不支持密码，需用 Personal Access Token 当密码）
#    Token 生成: GitHub -> Settings -> Developer settings -> Personal access tokens -> Fine-grained
#    权限: Contents = Read and write
git push github master
git push github --tags
```

⚠️ 注意两点：
- 仓库历史约 **407 MB**（早期把 Qt 构建产物提交进来了），首次推送会比较慢；
- GitHub 单文件上限 100 MB，当前最大被跟踪文件是 15.3 MB，**不会触发**拒绝。

如果不想带着历史大文件，也可以只推当前快照（新仓库、单次提交）：

```powershell
# 在全新目录里: git init + 从 gitee 拉一份干净工作区, 再提交推送
```

### 3.2 workflow 已就位

文件：`.github/workflows/build-desktop.yml`，三平台并行：

| Job | Runner | 产物 |
|---|---|---|
| Windows x64 | `windows-latest` | `YYWL键盘配置工具-<ver>-win.zip` |
| macOS x64 + arm64 | `macos-latest` | `...-mac.zip` / `...-arm64-mac.zip` |
| Linux x64 | `ubuntu-latest` | `....AppImage` |

关键实现点：
- `npm ci` → `npm run build` → `npx electron-builder <平台参数> --publish never`
- `CSC_IDENTITY_AUTO_DISCOVERY: 'false'`：没有签名证书时明确关掉，否则 macOS 会报错
- 缓存 `~/.cache/electron` 与 `~/.cache/electron-builder`，二次构建快很多
- Windows 额外跑一步 `Get-Item VersionInfo`，**打印出来验证图标/版本确实嵌入**

### 3.3 触发方式

| 方式 | 操作 | 结果 |
|---|---|---|
| 手动 | GitHub → Actions → Build Desktop → **Run workflow** | 只生成 Artifact，保留 30 天 |
| 打标签 | `git tag v1.0.0 && git push github v1.0.0` | 额外自动创建 **Release** 并挂上三个平台的包 |

### 3.4 拿到产物

Actions 页面 → 点某次运行 → 底部 **Artifacts** 下载 zip，解压即是各平台安装包。

拿到后按 §4.5 的「三平台发布清单」改名、上传、更新 manifest，网页下载页会自动生效。

> 建议顺序：先打 tag → CI 出三平台包 → 传服务器 + 改 manifest → 再发网页，避免用户点下载 404。

### 4.5 三平台发布清单（发版照做即可）

下载页 `/download.html` 是**数据驱动**的：它读取 `/download/manifest.json`，自动识别访问者系统并推荐对应包。**发版只改 manifest，不用改任何代码。**

**命名约定**（上传前把 CI 产物改成这个名字）：

| 平台 | 文件名 |
|---|---|
| Windows x64 | `yywlkey-config-<ver>-win-x64.zip` |
| macOS Intel | `yywlkey-config-<ver>-mac-x64.zip` |
| macOS Apple Silicon | `yywlkey-config-<ver>-mac-arm64.zip` |
| Linux x64 | `yywlkey-config-<ver>-linux-x64.AppImage` |

**发布步骤**：

1. 把包上传到 `/download/`（站点根目录下的 `download/`）
2. 计算 SHA256：
   - Windows `certutil -hashfile 文件名 SHA256`
   - macOS/Linux `shasum -a 256 文件名`
3. 编辑 `public/download/manifest.json` → 改 `version`、`updated`，把对应包的 `available` 置为 `true`，填 `file` / `size` / `sha256`
4. `npm run build` → 上传 `dist/download/manifest.json`（**只需这一个文件**，网页不用重发）
5. 打开 `https://key.itytsoft.com/download.html` 确认推荐卡片正确

> 未发布的平台把 `available` 保持 `false`，页面会显示"尚未发布"而不是给一个 404 链接 —— 这就是"预留位置"的意义：mac/linux 包到位前不用改代码，到位后改一个布尔值即可。

---

## 4. 发布到服务器

```powershell
# 1) 打包
npm run desktop:win

# 2) 改名成 ASCII（中文文件名在 URL 里会出错）
#    规则必须与网页里的拼法一致：yywlkey-config-<version>-win-x64.zip
copy "dist-desktop\YYWL键盘配置工具-1.0.0-win.zip" "$env:TEMP\yywlkey-config-1.0.0-win-x64.zip"

# 3) 上传（凭据从 quick-config/.env 读，别写死）
#    目标目录：/download/，最终地址 https://key.itytsoft.com/download/<文件名>
curl.exe -T "$env:TEMP\yywlkey-config-1.0.0-win-x64.zip" `
  "ftp://key.itytsoft.com/download/yywlkey-config-1.0.0-win-x64.zip" `
  --user "<user>:<pass>" --ftp-create-dirs

# 4) 验证
curl -sI https://key.itytsoft.com/download/yywlkey-config-1.0.0-win-x64.zip
# 期望 200 + Content-Type: application/zip + 正确的 Content-Length
```

### 版本号与下载链接的联动

网页左上角「软件下载」的地址是**由 `package.json` 的 `version` 自动拼出来的**（`DownloadBadge.jsx` 里 `import pkg from '../../package.json'`）：

```
/download/yywlkey-config-${pkg.version}-win-x64.zip
```

所以发新版的正确顺序是：

1. 改 `package.json` 的 `version`（例如 `1.0.0` → `1.1.0`）
2. `npm run desktop:win` → 产出 `YYWL键盘配置工具-1.1.0-win.zip`
3. 上传时改名为 `yywlkey-config-1.1.0-win-x64.zip`
4. **重新 `npm run build` 并部署网页**（否则网页还指向旧版本号）

⚠️ 顺序不能反：**先传包、再发网页**，否则用户点下载会 404。

---

## 5. 包体积说明（踩过的坑）

第一版打出来 **174 MB**，原因：`app.asar` 有 **111 MB** —— `react` / `misans` / `tailwindcss` / `daisyui` 这些**构建期依赖被打进了运行时包**。

它们其实已经被 Vite 打包进 `dist/` 了，运行时**一个都不需要**。修法是把它们从 `dependencies` 挪到 `devDependencies`，只保留 `node-hid`（主进程 `select-hid-device` 真要用）。

结果：

| 项 | 修前 | 修后 |
|---|---|---|
| `resources/app.asar` | 111.67 MB | **8.84 MB** |
| zip 包 | 173.98 MB | **115.89 MB** |

剩下的 116 MB 基本都是 Electron 运行时（`YYWL键盘配置工具.exe` 本身 180 MB），**这是 Electron 的固定成本，压不下去**。

> 以后新增依赖时留意：**只有主进程/预加载脚本真的 `require` 的包才放 `dependencies`**，其余一律 `devDependencies`。

---

## 6. 桌面版与网页版的差异

| 项 | 网页版 | 桌面版 |
|---|---|---|
| 访问方式 | 浏览器打开 URL | 双击 exe，自带本地静态服务器（`127.0.0.1` 随机端口） |
| WebHID | 用系统浏览器的设备选择框 | 无系统选择框，主进程监听 `select-hid-device` **自动挑 0xFF00 配置接口** |
| 联网 | 需要能访问站点 | **完全离线可用**（`dist` 已打进 asar） |
| 外链 | 直接跳转 | 交给系统浏览器打开（`shell.openExternal`） |
| UA 标记 | 无 | 追加 ` YYWLDesktop/1.0`，网页据此**不显示"下载桌面版"入口**，也**不显示"内嵌窗口无法连接键盘"拦截** |
| 打开外部网页 | — | 走系统默认浏览器 |

---

## 7. 打包后自检清单

1. 解压 zip，双击 `YYWL键盘配置工具.exe`，窗口正常打开且显示连接页；
2. 左上角**不应**出现「软件下载」按钮（UA 标记生效）；
3. 插上小键盘点「连接键盘」，能直接连上（不应弹出任何系统设备选择框）；
4. 断网后重启程序，页面仍能打开（离线包完整）；
5. 配置页右上角的旧版软件下载链接能唤起系统浏览器。

---

## 8. 程序图标

| 文件 | 说明 |
|---|---|
| `build/icon.svg` | **主方案源文件**（六边形，可编辑，坐标手工计算） |
| `build/icon.png` | 主方案导出，1024×1024 / 72 KB |
| `build/alt/icon-squircle.svg` / `.png` | **备选方案**：圆角方块 + 旋钮版 |

`package.json` 的 `win/mac/linux` 三处 `icon` 都指向 `build/icon.png`，electron-builder 自动转 `.ico` / `.icns`。

### 主方案（六边形）构成

| 元素 | 含义 |
|---|---|
| **六边形底板** + 品牌渐变（`#7c6cf8 → #5b4fe9 → #6d28d9`）+ 顶部斜向高光 | 硬件/物联语汇；**六边形轮廓比圆角方块少见，显著性更强，便于商标注册** |
| **3×2 键位**，居中键为琥珀渐变 | 小键盘本体；琥珀键 = "这个键可以被你自定义" |
| 对角两处**电路走线 + 焊点** | "物联"属性；48px 以上可辨，小尺寸弱化为纹理 |

键位按六边形几何中心对齐（x 115/215/315，y 165/265），不是按包围盒居中 —— 否则视觉上会偏。

设计取舍：**不做 3×3** —— 实测 16px 任务栏下 9 个键糊成一片；6 键在小尺寸仍有辨识度（已渲染 16/32/48/64/128/256/1024 逐级验证）。

### 版权说明

图标为**本项目原创几何绘制**：所有圆形/矩形/路径坐标均为手工计算，**未使用任何第三方图形素材、图标库、字体或商标元素**。渐变与配色为通用色值，不含他人标识。

> 通用几何形状本身几乎不受著作权保护；真正需要规避的是**商标**上的"近似"。六边形 + 键位 + 电路纹的组合具备足够显著性。
> 正式对外发布前建议做一次商标近似检索（中国商标网，第 9 类 + 第 42 类）。

### 切换到备选方案（圆角方块 + 旋钮）

把 `build/alt/icon-squircle.png` 覆盖成 `build/icon.png` 即可，`package.json` 不用改。
两套的区别：六边形更独特、更适合注册；圆角方块更贴合 Windows/macOS 原生图标语言。

### 已知限制

⚠️ 本机打包**不会**把这个图标嵌进 exe —— 改 exe 资源需要 `winCodeSign`（含 macOS 符号链接），本机无创建符号链接特权（见 §2 末尾）。**CI 打出来的包才会带上图标与版本号**。同理 macOS 的 `.icns`、Linux 的 PNG 图标也由各自 runner 生成。
