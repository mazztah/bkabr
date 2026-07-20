export default function Aurora({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <div
        className="mk-aurora absolute -top-1/3 left-1/4 h-[600px] w-[600px] rounded-full opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 70%)" }}
      />
      <div
        className="mk-aurora absolute top-1/4 right-1/4 h-[500px] w-[500px] rounded-full opacity-25 blur-[120px]"
        style={{ background: "radial-gradient(circle, var(--brand-accent), transparent 70%)", animationDelay: "-8s" }}
      />
    </div>
  );
}
