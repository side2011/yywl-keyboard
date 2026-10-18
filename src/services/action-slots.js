// src/services/action-slots.js
// 读取桌面版里已经配置好的「扩展动作」槽位。
//
// 背景: 设备侧只存键码, 无法区分"普通 F13"和"扩展触发键 F13";
//      真正的区别在桌面版的 actions.json。桌面版的内置本地服务暴露了
//      /__actions/summary, 页面读到它就能在键位上显示「⚡动作1 打开报价单」,
//      而不是干巴巴一个 F13。
//
// 网页版没有这个接口, fetch 会失败 → 返回 null, 界面按"未检测到桌面版"处理。

const ENDPOINT = '__actions/summary';

export async function fetchActionSummary() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${ENDPOINT}`, {
      cache: 'no-store',
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.slots)) return null;
    return data;
  } catch {
    return null; // 网页版 / 桌面版未运行
  }
}

// 把 slots 数组转成 { slot: name } 便于按编号查
export function toSlotMap(summary) {
  const map = {};
  if (summary && Array.isArray(summary.slots)) {
    for (const s of summary.slots) {
      if (s && s.slot) map[s.slot] = s.name || '';
    }
  }
  return map;
}
