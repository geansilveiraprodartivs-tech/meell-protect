interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

let listener: ((t: ToastState) => void) | null = null;
let nextId = 0;

export function toast(message: string, type: ToastState['type'] = 'info') {
  listener?.({ id: nextId++, message, type });
}

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export function Toaster() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    listener = (next) => {
      setToasts((prev) => [...prev, next]);
      const duration = next.type === 'error' ? 8000 : 5000;
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== next.id));
      }, duration);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon =
          t.type === 'success' ? CheckCircle2 :
          t.type === 'error' ? AlertCircle :
          t.type === 'warning' ? AlertTriangle : Info;
        const accentColor =
          t.type === 'success'
            ? 'border-l-pink-500'
            : t.type === 'error'
            ? 'border-l-rose-500'
            : t.type === 'warning'
            ? 'border-l-amber-400'
            : 'border-l-violet-500';
        const iconColor =
          t.type === 'success'
            ? 'text-pink-500'
            : t.type === 'error'
            ? 'text-rose-500'
            : t.type === 'warning'
            ? 'text-amber-500'
            : 'text-violet-500';
        return (
          <div
            key={t.id}
            className={`animate-fadeUp flex items-center gap-3 rounded-2xl border-l-4 ${accentColor} bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl px-4 py-3 text-sm font-medium shadow-glow`}
          >
            <Icon size={18} className={iconColor} />
            <span className="flex-1 text-meell-700 dark:text-slate-200">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 rounded-full p-0.5 text-meell-400 hover:bg-pink-50 dark:hover:bg-pink-900/30 hover:text-pink-500 transition">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}