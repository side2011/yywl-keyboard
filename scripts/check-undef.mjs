// ============================================================
// scripts/check-undef.mjs — 只检查"用了但没定义"的变量
//
// 为什么单独做这个：
//   项目里有些页面很少被渲染到（比如旧协议的 KeyConfigPanel），
//   少写一个 import 时 vite build 完全不会报错，只有用户点到那一页才白屏。
//   实测踩过：KeyConfigPanel 用了 isDesktopApp 却忘了 import，
//   客户点「扩展」标签整页空白，控制台报 ReferenceError。
//
// 用法: node scripts/check-undef.mjs
//   有任何 no-undef 就退出码 1（CI 里当闸门用）
// ============================================================
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

let stdout = ''
try {
  const r = await exec('npx', ['eslint', 'src', '--format', 'json', '--no-color'], {
    cwd: process.cwd(),
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === 'win32',
  })
  stdout = r.stdout
} catch (e) {
  // eslint 有问题时也会返回非 0，但 stdout 里仍有 JSON
  stdout = e.stdout || ''
  if (!stdout) {
    console.error('✗ eslint 执行失败：', e.message)
    process.exit(1)
  }
}

let data = []
try {
  data = JSON.parse(stdout)
} catch {
  console.error('✗ 解析 eslint 结果失败')
  process.exit(1)
}

const problems = []
for (const file of data) {
  for (const m of file.messages) {
    if (m.ruleId === 'no-undef' || m.ruleId === 'no-dupe-keys') {
      problems.push({ file: file.filePath.split(/[\\/]/).pop(), line: m.line, rule: m.ruleId, msg: m.message })
    }
  }
}

// ---- 额外检查：JSX 里用了大写组件，但文件里没 import / 没定义 ----
// eslint 的 no-undef 不检查 JSX 标签名，之前 <ForceUpdateButton /> 漏 import 直接白屏。
{
  const fs2 = await import('node:fs')
  const path2 = await import('node:path')
  const walk = (dir, out = []) => {
    for (const name of fs2.readdirSync(dir)) {
      const full = path2.join(dir, name)
      if (fs2.statSync(full).isDirectory()) walk(full, out)
      else if (/\.(jsx|js)$/.test(name)) out.push(full)
    }
    return out
  }
  const files = walk('src')
  for (const file of files) {
    const src = fs2.readFileSync(file, 'utf8')
    const defined = new Set()
    for (const m of src.matchAll(/import\s+([^;\n]+?)\s+from/g)) {
      for (const part of m[1].replace(/[{}]/g, ",").split(",")) {
        const nm = part.trim().split(/\s+as\s+/).pop()
        if (nm) defined.add(nm.trim())
      }
    }
    for (const m of src.matchAll(/(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) defined.add(m[1])
    for (const w of ['React', 'Fragment', 'Suspense', 'StrictMode']) defined.add(w)
    for (const m of src.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) {
      if (defined.has(m[1])) continue
      const line = src.slice(0, m.index).split("\n").length
      problems.push({ file: file.split(/[\\/]/).pop(), line, rule: 'jsx-undef', msg: '<' + m[1] + '> 未 import / 未定义' })
    }
  }
}

if (problems.length) {
  console.error(`✗ 发现 ${problems.length} 个会导致运行时白屏的问题：`)
  for (const p of problems) console.error(`  ${p.file}:${p.line}  [${p.rule}] ${p.msg}`)
  process.exit(1)
}

console.log('✓ 没有未定义变量 / 重复键（no-undef, no-dupe-keys 均为 0）')
