import { useState, useEffect } from 'react';

const STORAGE_KEY = 'meell_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t border-pink-100 dark:border-pink-900/30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl px-5 py-4 shadow-glow">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-sm text-meell-600 dark:text-slate-300">
          Este site usa cookies para melhorar sua experiência. Ao continuar navegando, você concorda com nossa política de cookies.
        </p>
        <button
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, 'true');
            setVisible(false);
          }}
          className="btn-primary shrink-0"
        >
          Aceitar
        </button>
      </div>
    </div>
  );
}