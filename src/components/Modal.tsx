import React, { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export default React.memo(function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-md sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={dialogRef}
        className={`w-full ${maxWidth} animate-fadeUp rounded-t-3xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl p-6 shadow-glow sm:rounded-3xl`}
      >
        <div className="h-1 w-16 mx-auto mb-4 rounded-full bg-gradient-primary" />
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-meell-800 dark:text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-meell-400 transition hover:bg-pink-50 dark:hover:bg-pink-900/30 hover:text-pink-500"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
});