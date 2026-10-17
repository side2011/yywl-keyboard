// src/components/MicGuidePage.jsx
// AC632N 麦克风设备专用引导页 — 使用教程视频 + 配置软件下载
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';

const DOWNLOAD_WIN = 'https://lqkj.net.cn/download/Windows.zip';
const DOWNLOAD_MAC = 'https://lqkj.net.cn/download/LQ_KEYBOARD.dmg';
const VIDEO_URL = 'https://lqkj.net.cn/download/MicUseVideo.mp4';

function detectOS() {
  const ua = navigator.userAgent || '';
  if (/win/i.test(ua)) return 'windows';
  if (/mac/i.test(ua)) return 'mac';
  return 'other';
}

function MicGuidePage() {
  const { t, lang } = useLang();
  const navigate = useNavigate();
  const detectedOS = useMemo(() => detectOS(), []);
  const [selectedOS, setSelectedOS] = useState(detectedOS === 'other' ? '' : detectedOS);

  const isZh = lang === 'zh';

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 to-white">
      {/* 顶部导航 */}
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-2 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          {t('返回首页')}
        </button>
        <button
          onClick={() => {
            const next = isZh ? 'en' : 'zh';
            // 复用全局语言切换
            localStorage.setItem('yywl-lang', next);
            window.location.reload();
          }}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors cursor-pointer"
        >
          {isZh ? 'English' : '中文'}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-4 pb-12">
        {/* 标题 */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            {t('自定义键盘麦克风配置引导')}
          </h1>
          <p className="text-sm text-gray-500">
            {t('按照以下步骤完成设备配置')}
          </p>
        </div>

        {/* 步骤 1: 观看教程视频 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">1</span>
            <h2 className="text-lg font-bold text-gray-900">{t('观看使用教程')}</h2>
          </div>
          <div className="rounded-xl overflow-hidden bg-black aspect-video">
            <video
              src={VIDEO_URL}
              controls
              className="w-full h-full object-contain"
              preload="metadata"
            >
              {t('您的浏览器不支持视频播放')}
            </video>
          </div>
        </div>

        {/* 步骤 2: 下载配置软件 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">2</span>
            <h2 className="text-lg font-bold text-gray-900">{t('下载配置软件')}</h2>
          </div>

          {detectedOS !== 'other' && (
            <p className="text-sm text-gray-500 mb-4">
              {t('检测到您当前系统为：')}
              <span className="font-semibold text-indigo-600 ml-1">
                {detectedOS === 'windows' ? 'Windows' : 'macOS'}
              </span>
              {t('，已为您推荐对应版本')}
            </p>
          )}

          {detectedOS === 'other' && !selectedOS && (
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-3">{t('请选择您的操作系统：')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedOS('windows')}
                  className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer text-center"
                >
                  <div className="text-2xl mb-1">🪟</div>
                  <div className="text-sm font-semibold text-gray-800">Windows</div>
                </button>
                <button
                  onClick={() => setSelectedOS('mac')}
                  className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer text-center"
                >
                  <div className="text-2xl mb-1">🍎</div>
                  <div className="text-sm font-semibold text-gray-800">macOS</div>
                </button>
              </div>
            </div>
          )}

          {(detectedOS !== 'other' || selectedOS) && (
            <div className="space-y-3">
              {/* Windows 下载 */}
              <a
                href={DOWNLOAD_WIN}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  (detectedOS === 'windows' || selectedOS === 'windows')
                    ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">Windows</span>
                    {(detectedOS === 'windows' || selectedOS === 'windows') && (
                      <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium">{t('推荐')}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">{t('下载后解压运行即可')}</div>
                </div>
                <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Mac 下载 */}
              <a
                href={DOWNLOAD_MAC}
                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                  (detectedOS === 'mac' || selectedOS === 'mac')
                    ? 'border-indigo-400 bg-indigo-50 shadow-sm'
                    : 'border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-900">macOS</span>
                    {(detectedOS === 'mac' || selectedOS === 'mac') && (
                      <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium">{t('推荐')}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">.dmg {t('安装包')}</div>
                </div>
                <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* 其他系统切换 */}
              {detectedOS === 'other' && selectedOS && (
                <button
                  onClick={() => setSelectedOS('')}
                  className="w-full text-center text-sm text-gray-400 hover:text-indigo-600 transition-colors mt-1 cursor-pointer"
                >
                  {t('重新选择系统')}
                </button>
              )}
            </div>
          )}
        </div>

        {/* 步骤 3: 配置并导入 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">3</span>
            <h2 className="text-lg font-bold text-gray-900">{t('配置并导入')}</h2>
          </div>
          <div className="text-sm text-gray-600 leading-relaxed space-y-2">
            <p>{t('下载并安装配置软件后，按照视频中的教程完成按键配置。')}</p>
            <p>{t('配置完成后，将配置文件通过本页面导入即可使用。')}</p>
          </div>
        </div>

        {/* 技术支持 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v4m0 4h.01" />
              </svg>
            </span>
            <h2 className="text-lg font-bold text-gray-900">{t('技术支持')}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="https://wpa.qq.com/msgrd?v=3&uin=1291285148&site=qq&s=2"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xs">QQ</span>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('技术QQ')}</div>
                <div className="font-bold text-gray-900 font-mono text-base">1291285148</div>
              </div>
            </a>
            <a
              href="mailto:1291285148@qq.com"
              className="flex items-center gap-3 p-4 rounded-xl bg-violet-50 border border-violet-100 hover:bg-violet-100 transition-colors cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.19a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('技术邮箱')}</div>
                <div className="font-bold text-gray-900 font-mono text-sm">1291285148@qq.com</div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MicGuidePage;
