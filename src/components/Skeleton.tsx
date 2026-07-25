export function SkeletonLine({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-pink-200/60 dark:bg-pink-900/30 ${className || 'h-4 w-full'}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-pink-100 dark:border-pink-900/30 bg-white/60 dark:bg-slate-800/60 backdrop-blur p-4 space-y-3 animate-pulse shadow-card">
      <SkeletonLine className="h-5 w-2/3" />
      <SkeletonLine className="h-4 w-full" />
      <SkeletonLine className="h-4 w-1/2" />
    </div>
  );
}