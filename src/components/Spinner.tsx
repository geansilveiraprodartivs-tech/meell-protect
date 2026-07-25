import React from 'react';
import { Loader2 } from 'lucide-react';

const Spinner = React.memo(function Spinner({ size = 18, label }: { size?: number; label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 text-meell-400">
      <Loader2 size={size} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
});

export default Spinner;

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner size={28} label="Carregando Meell Protect..." />
    </div>
  );
}
