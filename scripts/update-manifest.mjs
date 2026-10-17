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
]

const dryRun = process.argv.includes('--dry-run')

function sha256(file) {
  const h = crypto.createHash('sha256')
  h.update(fs.readFileSync(file))
  return h.digest('hex').toUpperCase()
}

const packages = SLOTS.map((slot) => {
  const abs = path.join(SRC, slot.file)
  if (fs.existsSync(abs) && fs.statSync(abs).size > 0) {
    const size = fs.statSync(abs).size
    const hash = sha256(abs)
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

const manifest = {
  version: VERSION,
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
