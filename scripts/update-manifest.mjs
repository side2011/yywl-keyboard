// ============================================================
// scripts/update-manifest.mjs — 根据实际产物刷新下载页清单
//
// 用法:
//   node scripts/update-manifest.mjs            # 扫描 release/download/, 有文件就标记为可用
//   node scripts/update-manifest.mjs --dry-run  # 只看会改什么
//
// 约定文件名 (与 public/download.html 的拼法一致):
//   yywlkey-config-<version>-win-x64.zip
//   yywlkey-config-<version>-mac-x64.zip
//   yywlkey-config-<version>-mac-arm64.zip
//   yywlkey-config-<version>-linux-x64.AppImage
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const VERSION = PKG.version
const SRC = path.join(ROOT, 'release', 'download')
const MANIFEST = path.join(ROOT, 'public', 'download', 'manifest.json')

const SLOTS = [
  { id: 'win-x64', platform: 'windows', arch: 'x64', file: `yywlkey-config-${VERSION}-win-x64.zip`, label: 'Windows 10 / 11（64 位）', note: '免安装绿色版，解压即用' },
  { id: 'mac-x64', platform: 'macos', arch: 'x64', file: `yywlkey-config-${VERSION}-mac-x64.zip`, label: 'macOS · Intel 芯片', note: '右键 → 打开' },
  { id: 'mac-arm64', platform: 'macos', arch: 'arm64', file: `yywlkey-config-${VERSION}-mac-arm64.zip`, label: 'macOS · Apple 芯片（M 系列）', note: '右键 → 打开' },
  { id: 'linux-x64', platform: 'linux', arch: 'x64', file: `yywlkey-config-${VERSION}-linux-x64.AppImage`, label: 'Linux（AppImage）', note: 'chmod +x 后运行' },
  // 国产系统（麒麟 / UOS / deepin）专用便携版：不用 AppImage，
  // 避开 FUSE 缺失、noexec 挂载、user namespace 被禁（沙箱起不来）三个坑
  { id: 'linux-x64-domestic', platform: 'linux', arch: 'x64', file: `yywlkey-config-${VERSION}-linux-x64-domestic.tar.gz`, label: '国产系统 · x86_64（麒麟 / UOS 便携版）', note: '解压即用，无需安装' },
  { id: 'linux-arm64-domestic', platform: 'linux', arch: 'arm64', file: `yywlkey-config-${VERSION}-linux-arm64-domestic.tar.gz`, label: '国产系统 · ARM64（飞腾 / 鲲鹏）', note: '解压即用，无需安装' },
]

const dryRun = process.argv.includes('--dry-run')

// --meta=<dir>：从"产物校验信息"里读大小和哈希（CI 用；不下载整个安装包）
// 不传时退回扫描本地 release/download/（本地打包用）
const metaArg = process.argv.find((a) => a.startsWith('--meta='))
const metaDir = metaArg ? path.resolve(ROOT, metaArg.slice(7)) : ''
let metaFiles = null
if (metaDir && fs.existsSync(metaDir)) {
  metaFiles = {}
  // 递归找 json：CI 里每个平台的 artifact 会落在各自子目录
  const walk = (dir, depth = 0) => {
    if (depth > 3) return
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name)
      if (fs.statSync(abs).isDirectory()) { walk(abs, depth + 1); continue }
      if (!name.endsWith('.json')) continue
      try {
        const data = JSON.parse(fs.readFileSync(abs, 'utf8'))
        Object.assign(metaFiles, data.files || {})
      } catch (e) {
        console.log(`  ! 跳过坏掉的 meta 文件 ${name}: ${e.message}`)
      }
    }
  }
  walk(metaDir)
  console.log(`  从 meta 读到了 ${Object.keys(metaFiles).length} 个产物信息`)
}

function sha256(file) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(file))
  return h.digest('hex').toUpperCase()
}

const packages = SLOTS.map((slot) => {
  const abs = path.join(SRC, slot.file)
  const meta = metaFiles ? metaFiles[slot.file] : null
  const fromDisk = !metaFiles && fs.existsSync(abs) && fs.statSync(abs).size > 0
  if (meta || fromDisk) {
    const size = meta ? meta.size : fs.statSync(abs).size
    const hash = meta ? meta.sha256 : sha256(abs)
    console.log(`  ✓ ${slot.file}  ${(size / 1048576).toFixed(1)} MB  ${hash.slice(0, 12)}…`)
    return {
      id: slot.id,
      platform: slot.platform,
      arch: slot.arch,
      label: slot.label,
      file: slot.file,
      available: true,
      size,
      sha256: hash,
      note: slot.note,
    }
  }
  console.log(`  · ${slot.file}  未找到 → 标记为"尚未发布"`)
  return {
    id: slot.id,
    platform: slot.platform,
    arch: slot.arch,
    label: slot.label,
    file: slot.file,
    available: false,
    note: '尚未发布',
  }
})

// 网页内容指纹（与桌面版的自动更新对应），方便排查"装的是哪一版"
let webBuildId = ''
try {
  webBuildId = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'version.json'), 'utf8')).buildId || ''
} catch { /* 没有 dist 也不影响清单生成 */ }

const manifest = {
  version: VERSION,
  webBuildId,
  updated: new Date().toISOString().slice(0, 10),
  packages,
}

const json = JSON.stringify(manifest, null, 2) + '\n'

if (dryRun) {
  console.log('\n[dry-run] 不会写入文件，内容如下：\n' + json)
  process.exit(0)
}

fs.writeFileSync(MANIFEST, json)
console.log(`\n  已更新 ${path.relative(ROOT, MANIFEST)}`)
console.log(`  版本 ${VERSION} · 可用包 ${packages.filter((p) => p.available).length}/${packages.length}`)
