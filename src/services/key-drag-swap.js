// 按键拖拽互换：把「按键 A」拖到「按键 B」上，两个键的功能整体交换
// 用法（各配置页共用）：
//   const { dragIndex, overIndex, dragProps } = useKeyDragSwap({ onSwap: handleSwapKeys, disabled: loading });
//   <button {...dragProps(i)} className={... (dragIndex===i?'opacity-40':'') (overIndex===i?'ring-2 ring-indigo-400':'')}>
import { useCallback, useState } from 'react';

/** 交换数组里两个元素（返回新数组） */
export function swapItems(arr, a, b) {
  const next = [...arr];
  const tmp = next[a];
  next[a] = next[b];
  next[b] = tmp;
  return next;
}

export function useKeyDragSwap({ onSwap, disabled = false } = {}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const reset = useCallback(() => { setDragIndex(null); setOverIndex(null); }, []);

  const dragProps = useCallback((i) => ({
    draggable: !disabled,
    onDragStart: (e) => {
      if (disabled) return;
      setDragIndex(i);
      try {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));   // Firefox 必须 setData 才能拖
      } catch { /* 忽略 */ }
    },
    onDragEnd: reset,
    onDragOver: (e) => {
      if (disabled || dragIndex === null) return;
      e.preventDefault();                                   // 允许放下
      try { e.dataTransfer.dropEffect = 'move'; } catch { /* 忽略 */ }
      if (overIndex !== i) setOverIndex(i);
    },
    onDragLeave: () => { if (overIndex === i) setOverIndex(null); },
    onDrop: (e) => {
      e.preventDefault();
      const from = dragIndex;
      reset();
      if (disabled || from === null || from === i) return;
      if (typeof onSwap === 'function') onSwap(from, i);
    },
  }), [disabled, dragIndex, overIndex, onSwap, reset]);

  return { dragIndex, overIndex, dragProps, reset };
}
