interface ToastState {
  message: string;
  type: 'success' | 'error' | 'info';
}

let listener: ((t: ToastState) => void) | null = null;

export function toast(message: string, type: ToastState['type'] = 'info') {
  listener?.({ message, type });
}

import { useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';

export function Toaster() {
  const [t, setT] = useState<ToastState | null>(null);
  useEffect(() => {
    listener = (next) => {
      setT(next);
      setTimeout(() => setT(null), 3500);
    };
    return () => {
      listener = null;
    };
  }, []);

  if (!t) return null;
  const Icon = t.type === 'success' ? CheckCircle2 : t.type === 'error' ? AlertCircle : Info;
  const color =
    t.type === 'success'
      ? 'text-emerald-600 bg-emerald-50 ring-emerald-100'
      : t.type === 'error'
      ? 'text-rose-600 bg-rose-50 ring-rose-100'
      : 'text-lilas-600 bg-lilas-50 ring-lilas-100';
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 animate-fadeUp">
      <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-soft ring-1 ${color}`}>
        <Icon size={18} />
        {t.message}
      </div>
    </div>
  );
}
