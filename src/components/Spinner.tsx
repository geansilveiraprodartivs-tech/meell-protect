import React from 'react';
import { Loader2 } from 'lucide-react';

const Spinner = React.memo(function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-pink-500">
      <Loader2 size={size} className="animate-spin text-pink-500" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
});

export default Spinner;

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-hero">
      <div className="glass rounded-3xl px-8 py-6 shadow-glow">
        <Spinner size={28} label="Carregando Meell Protect..." />
      </div>
    </div>
  );
}