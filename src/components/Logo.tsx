import { Shield } from 'lucide-react';

export default function Logo({ size = 36, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-meell-500 to-lilas-500 text-white shadow-soft"
        style={{ width: size, height: size }}
      >
        <Shield size={size * 0.55} strokeWidth={2.4} />
      </div>
      {withText && (
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight text-meell-700">
            MEELL <span className="text-lilas-600">PROTECT</span>
          </div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-meell-300">
            by Meell · v1.0 Beta
          </div>
        </div>
      )}
    </div>
  );
}
