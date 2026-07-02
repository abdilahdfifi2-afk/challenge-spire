import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/tournaments")({
  head: () => ({ meta: [{ title: "البطولات — ArenaX" }] }),
  component: TournamentsPage,
});

function TournamentsPage() {
  const list = useQuery({
    queryKey: ["tournaments-list"],
    queryFn: async () => (await supabase.from("tournaments").select("*, games(name)").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2 mb-6"><Trophy className="h-7 w-7 text-primary" /> البطولات</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(list.data ?? []).length === 0 && <div className="card-elevated p-8 text-center text-muted-foreground col-span-full">لا توجد بطولات بعد.</div>}
        {list.data?.map((t: any) => (
          <div key={t.id} className="card-elevated p-5">
            <div className="text-xs text-accent">{t.games?.name}</div>
            <h3 className="font-display text-lg font-semibold mt-1">{t.title}</h3>
            {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">الرسوم:</span> {formatCurrency(t.entry_fee)}</div>
              <div><span className="text-muted-foreground">الجائزة:</span> <span className="font-bold text-gradient-primary">{formatCurrency(t.prize_pool)}</span></div>
              <div><span className="text-muted-foreground">اللاعبون:</span> {t.max_players}</div>
              <div><span className="text-muted-foreground">الحالة:</span> {t.status}</div>
            </div>
            {t.starts_at && <div className="mt-2 text-xs text-muted-foreground">تبدأ: {formatDate(t.starts_at)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
