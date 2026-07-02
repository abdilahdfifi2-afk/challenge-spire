export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border bg-background/50">
      <div className="mx-auto max-w-7xl px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-6 w-6 rounded-md gradient-primary grid place-items-center text-primary-foreground text-xs font-bold">A</span>
          <span>© {new Date().getFullYear()} ArenaX — منصة الألعاب التنافسية</span>
        </div>
        <div className="text-xs text-muted-foreground">صُنع بشغف للاعبين العرب 🎮</div>
      </div>
    </footer>
  );
}
