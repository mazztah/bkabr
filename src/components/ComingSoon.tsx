export default function ComingSoon({
  title,
  icon,
  description,
}: {
  title: string;
  icon: string;
  description: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md text-center">
        <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--primary)] to-[var(--brand-accent)] text-2xl shadow-sm">
          {icon}
        </div>
        <h1 className="mb-2 text-xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Modul in Entwicklung
        </p>
      </div>
    </div>
  );
}
