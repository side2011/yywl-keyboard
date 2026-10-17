import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// MiSans 小米字体 — 免费商用授权, unicode-range 切片 woff2 (浏览器只下载用到的切片)
// 字重覆盖: 400(Regular) 500(Medium) 600(Demibold) 700(Bold), 与 UI 的 font-medium/semibold/bold 对应
import 'misans/lib/Normal/MiSans-Regular.min.css'
import 'misans/lib/Normal/MiSans-Medium.min.css'
import 'misans/lib/Normal/MiSans-Demibold.min.css'
import 'misans/lib/Normal/MiSans-Bold.min.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
