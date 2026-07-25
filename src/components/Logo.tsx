import React from 'react';
import { Shield } from 'lucide-react';

export default React.memo(function Logo({ size = 36, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative flex items-center justify-center rounded-2xl bg-gradient-primary text-white shadow-glow"
        style={{ width: size, height: size }}
      >
        <Shield size={size * 0.55} strokeWidth={2.4} />
      </div>
      {withText && (
        <div className="leading-tight">
          <div className="text-base font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-primary" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800 }}>
            MEELL PROTECT
          </div>
        </div>
      )}
    </div>
  );
});