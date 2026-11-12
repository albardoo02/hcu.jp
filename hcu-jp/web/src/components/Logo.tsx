export function Logo({ className = "" }: { className?: string }) {
  return (
    <a href="/" className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/favicon.svg" alt="" className="size-9 rounded-xl ring-1 ring-white/10" />
      <span className="text-lg font-bold tracking-tight text-white">
        hcu<span className="text-gradient">.jp</span>
      </span>
    </a>
  );
}
