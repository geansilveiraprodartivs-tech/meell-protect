export function SkeletonLine({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className || 'h-4 w-full'}`} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border p-4 space-y-3 animate-pulse dark:border-slate-700">
      <SkeletonLine className="h-5 w-2/3" />
      <SkeletonLine className="h-4 w-full" />
      <SkeletonLine className="h-4 w-1/2" />
    </div>
  );
}
