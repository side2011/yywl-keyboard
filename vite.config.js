import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 前端路由 (BrowserRouter) —— 构建时为每个路由生成一份 index.html 副本,
// 这样即使 nginx 没有配置 try_files SPA 回退, 直接访问 /customize 也能正常打开
// (nginx 默认 index 指令: 请求目录时返回该目录下的 index.html)
const SPA_ROUTES = ['customize', 'bt', 'keytest', 'mic']

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

function spaRouteFallbacks(routes) {
  return {
    name: 'spa-route-fallbacks',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist')
      const entry = path.join(dist, 'index.html')
      if (!fs.existsSync(entry)) return
      const html = fs.readFileSync(entry)
      for (const route of routes) {
        const dir = path.join(dist, route)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'index.html'), html)
      }
    },
  }
}

// 内容指纹: 用 dist 全部文件的哈希生成 buildId (不含 version.json / update.json)
// 同样的内容 → 同样的 buildId, 所以 CI 打包与线上部署不会产生"假更新"
function contentVersion() {
  return {
    name: 'content-version',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(__dirname, 'dist')
      if (!fs.existsSync(dist)) return
      const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
      const skip = new Set(['version.json', 'update.json'])
      const files = walk(dist)
        .filter((f) => !skip.has(path.basename(f)))
        .sort()
      const h = crypto.createHash('sha256')
      for (const f of files) {
        h.update(path.relative(dist, f).replace(/\\/g, '/'))
        h.update('\0')
        h.update(fs.readFileSync(f))
        h.update('\0')
      }
      const buildId = h.digest('hex').slice(0, 12)
      const info = {
        buildId,
        appVersion: pkg.version,
        builtAt: new Date().toISOString(),
        fileCount: files.length,
      }
      fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify(info, null, 2) + '\n')
      console.log(`\n  内容指纹 buildId = ${buildId}  (${files.length} 个文件)`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), spaRouteFallbacks(SPA_ROUTES), contentVersion()],
  // 站点部署在域名根目录 (https://key.itytsoft.com/)
  // 历史: 早期挂在 /ws/ 子路径下, 现已迁移到根目录
  base: '/',
  build: {
    // 产物放 /static/ 而不是 /assets/:
    // 站点根下的 /assets 是旧站遗留目录, 属主 root:root, FTP 账号无写权限 (553),
    // 换一个命名彻底避开冲突, 也便于区分新旧资源
    assetsDir: 'static',
  },
})
