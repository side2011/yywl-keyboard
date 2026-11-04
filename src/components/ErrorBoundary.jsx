import React from 'react';

// 全局错误兜底：任何页面渲染时抛异常，都不再是"白屏"，而是显示可复制的错误信息。
// 背景：客户反馈"进入配置页面是空白的"，白屏什么线索都没有，只能靠猜。
// 这里把错误文本、组件栈、UA 都显示出来，客户截个图我们就能定位。
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    try { console.error('[ErrorBoundary] 页面渲染失败:', error, info); } catch { /* 忽略 */ }
  }

  copyText() {
    const { error, info } = this.state;
    const text = [
      'YYWL 页面错误报告',
      '时间: ' + new Date().toLocaleString(),
      '页面: ' + location.href,
      '浏览器: ' + navigator.userAgent,
      '',
      '错误: ' + (error && (error.name + ': ' + error.message)),
      '',
      '组件栈:',
      info && info.componentStack ? info.componentStack : '(无)',
      '',
      '调用栈:',
      error && error.stack ? error.stack : '(无)',
    ].join('\n');
    try {
      navigator.clipboard.writeText(text);
      alert('错误信息已复制，请粘贴发给技术支持');
    } catch {
      alert(text);
    }
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, "Microsoft YaHei", sans-serif', color: '#1e293b' }}>
        <div style={{ maxWidth: 860, margin: '40px auto', background: '#fff', border: '1px solid #fecaca', borderRadius: 14, padding: 22 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c', marginBottom: 8 }}>
            ⚠ 页面出错了（不是你的操作问题）
          </div>
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.8, marginBottom: 14 }}>
            这个页面在渲染时遇到了异常。请点下面的按钮把错误信息复制发给我们，我们会立刻修。
            <br />
            可以先试：<b>刷新页面</b>、点页面上的「🔄 强制更新」、或换 Chrome / Edge 打开。
          </div>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, fontSize: 12, color: '#7f1d1d', whiteSpace: 'pre-wrap', maxHeight: 260, overflow: 'auto', lineHeight: 1.6 }}>
            {String(error && (error.name + ': ' + error.message))}
            {info && info.componentStack ? '\n\n组件栈：' + info.componentStack.split('\n').slice(0, 8).join('\n') : ''}
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => this.copyText()}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
              复制错误信息
            </button>
            <button
              onClick={() => location.reload()}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
              刷新页面
            </button>
            <button
              onClick={() => { location.replace(location.pathname + '?v=' + Date.now()); }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 600, cursor: 'pointer' }}>
              强制更新
            </button>
          </div>
        </div>
      </div>
    );
  }
}
