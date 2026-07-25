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
        const color =
          t.type === 'success'
            ? 'text-emerald-600 bg-emerald-50 ring-emerald-100'
            : t.type === 'error'
            ? 'text-rose-600 bg-rose-50 ring-rose-100'
            : t.type === 'warning'
            ? 'text-amber-600 bg-amber-50 ring-amber-100'
            : 'text-lilas-600 bg-lilas-50 ring-lilas-100';
        const darkColor =
          t.type === 'success'
            ? 'dark:text-emerald-400 dark:bg-emerald-900/80 dark:ring-emerald-800'
            : t.type === 'error'
            ? 'dark:text-rose-400 dark:bg-rose-900/80 dark:ring-rose-800'
            : t.type === 'warning'
            ? 'dark:text-amber-400 dark:bg-amber-900/80 dark:ring-amber-800'
            : 'dark:text-lilas-400 dark:bg-slate-800 dark:ring-slate-700';
        return (
          <div
            key={t.id}
            className={`animate-fadeUp flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-soft ring-1 ${color} ${darkColor}`}
          >
            <Icon size={18} />
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-1 rounded-full p-0.5 hover:bg-black/5 dark:hover:bg-white/10">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
