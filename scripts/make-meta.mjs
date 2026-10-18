// ============================================================
// scripts/make-meta.mjs — 生成"产物校验信息"（体积 + SHA256）
//
// 为什么需要它：
//   清单任务要知道每个安装包的大小和哈希，但把 650MB 的安装包当 artifact
//   上传会吃光 GitHub Actions 的免费存储（0.5GB）。所以构建完只上传这个
//   几 KB 的 meta.json，清单任务据此生成下载页清单。
//
// 用法:
//   node scripts/make-meta.mjs             # 扫描 release/download/ → 写 meta.json
//   node scripts/make-meta.mjs --out=xx    # 指定输出路径
// ============================================================
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SRC = path.join(ROOT, 'release', 'download')

const outArg = process.argv.find((a) => a.startsWith('--out='))
const OUT = outArg ? path.resolve(ROOT, outArg.slice(6)) : path.join(SRC, 'meta.json')

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').toUpperCase()
}

if (!fs.existsSync(SRC)) {
  console.error(`✗ 找不到 ${path.relative(ROOT, SRC)}，先打包再生成 meta`)
  process.exit(1)
}

const files = {}
for (const name of fs.readdirSync(SRC).sort()) {
  const abs = path.join(SRC, name)
  if (!fs.statSync(abs).isFile()) continue
  if (name === 'meta.json') continue
  const size = fs.statSync(abs).size
  if (!size) continue
  const hash = sha256(abs)
  files[name] = { size, sha256: hash }
  console.log(`  ✓ ${name}  ${(size / 1048576).toFixed(1)} MB  ${hash.slice(0, 12)}…`)
}

if (!Object.keys(files).length) {
  console.error('✗ release/download/ 里没有可用的产物')
  process.exit(1)
}

fs.writeFileSync(OUT, JSON.stringify({ files }, null, 2) + '\n')
console.log(`\n  已写入 ${path.relative(ROOT, OUT)}（${Object.keys(files).length} 个文件，几 KB）`)
