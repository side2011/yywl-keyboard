// ============================================================
// scripts/make-update.mjs — 生成桌面版在线更新清单
//
// 在 `npm run build` 之后运行, 产出:
//   dist/update.json          更新清单 (文件名 + sha256 + 大小), 随站点一起部署
//   release/offline-update/   离线更新包目录 (含 update.json + 全部文件), 拷到内网机器用
//
// 用法:
//   node scripts/make-update.mjs             只生成 dist/update.json
//   node scripts/make-update.mjs --offline   同时生成离线包目录
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const RELEASE = path.join(ROOT, 'release')

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

if (!fs.existsSync(DIST)) {
  console.error('找不到 dist/, 请先运行 npm run build')
  process.exit(1)
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const versionPath = path.join(DIST, 'version.json')
if (!fs.existsSync(versionPath)) {
  console.error('找不到 dist/version.json, 请先运行 npm run build')
  process.exit(1)
}
const buildInfo = JSON.parse(fs.readFileSync(versionPath, 'utf8'))

// 清单: 排除三类文件
//   update.json           —— 清单自身
//   version.json          —— 客户端安装时按 buildId 自行写入 (放进清单会每次都"内容不同")
//   download/manifest.json —— 由 CI 的 manifest 任务单独生成并覆盖, 时间晚于构建,
//                             放进清单会让 sha256 与服务器实际文件对不上, 更新直接失败
const EXCLUDE_NAMES = ['update.json', 'version.json']
const EXCLUDE_PATHS = ['download/manifest.json']
const files = walk(DIST)
  .filter((f) => !EXCLUDE_NAMES.includes(path.basename(f)))
  .filter((f) => !EXCLUDE_PATHS.includes(path.relative(DIST, f).replace(/\\/g, '/')))
  .sort()

const entries = files.map((abs) => {
  const buf = fs.readFileSync(abs)
  return {
    path: path.relative(DIST, abs).replace(/\\/g, '/'),
    size: buf.length,
    sha256: sha256(buf),
  }
})

const totalSize = entries.reduce((n, e) => n + e.size, 0)
const manifest = {
  buildId: buildInfo.buildId,
  appVersion: pkg.version,
  builtAt: buildInfo.builtAt,
  generatedAt: new Date().toISOString(),
  fileCount: entries.length,
  totalSize,
  files: entries,
}

fs.writeFileSync(path.join(DIST, 'update.json'), JSON.stringify(manifest, null, 2) + '\n')

console.log(`\n  更新清单 dist/update.json`)
console.log(`  buildId   ${manifest.buildId}`)
console.log(`  文件数    ${entries.length}`)
console.log(`  总大小    ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
console.log(`  最大文件  ${entries.slice().sort((a, b) => b.size - a.size)[0].path}`)

if (process.argv.includes('--offline')) {
  const outDir = path.join(RELEASE, 'offline-update')
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })
  for (const entry of entries) {
    const src = path.join(DIST, entry.path)
    const dest = path.join(outDir, entry.path)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
  fs.copyFileSync(path.join(DIST, 'update.json'), path.join(outDir, 'update.json'))
  console.log(`\n  离线更新包 release/offline-update/`)
  console.log(`  把整个目录拷到目标电脑, 在桌面版里「文件 → 导入离线更新包」选择它即可`)
}
