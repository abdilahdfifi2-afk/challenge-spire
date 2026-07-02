import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { gameCover, pickBanner, TOURNAMENT_BANNERS } from "@/lib/media";
import { Trophy, Users } from "lucide-react";

export const Route = createFileRoute("/tournaments")({
  head: () => ({ meta: [{ title: "البطولات — ArenaX" }] }),
  component: TournamentsPage,
});

function TournamentsPage() {
  const list = useQuery({
    queryKey: ["tournaments-list"],
    queryFn: async () => (await supabase.from("tournaments").select("*, games(name,slug)").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2 mb-6"><Trophy className="h-7 w-7 text-primary" /> البطولات</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(list.data ?? []).length === 0 && <div className="card-elevated p-8 text-center text-muted-foreground col-span-full">لا توجد بطولات بعد.</div>}
        {list.data?.map((t: any) => (
          <Link key={t.id} to="/tournaments/$tournamentId" params={{ tournamentId: t.id }} className="card-elevated overflow-hidden group hover:border-primary/40 transition block">
            <div className="relative h-40 overflow-hidden">
              <img
                src={t.banner_url || gameCover(t.games?.slug, t.game_id) || pickBanner(TOURNAMENT_BANNERS, t.id)}
                alt={t.title} loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
              <span className="absolute top-3 end-3 text-xs px-2 py-1 rounded-full bg-success/20 text-success backdrop-blur">{t.status}</span>
              {t.games?.name && <span className="absolute top-3 start-3 text-xs px-2 py-1 rounded-full bg-background/60 text-accent backdrop-blur">{t.games.name}</span>}
            </div>
            <div className="p-5">
              <h3 className="font-display text-lg font-semibold group-hover:text-primary transition-colors">{t.title}</h3>
              {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">الرسوم:</span> {formatCurrency(t.entry_fee)}</div>
                <div><span className="text-muted-foreground">الجائزة:</span> <span className="font-bold text-gradient-primary">{formatCurrency(t.prize_pool)}</span></div>
                <div className="flex items-center gap-1"><Users className="h-3 w-3" /> {t.max_players} لاعب</div>
                <div><span className="text-muted-foreground">الحالة:</span> {t.status}</div>
              </div>
              {t.starts_at && <div className="mt-2 text-xs text-muted-foreground">تبدأ: {formatDate(t.starts_at)}</div>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
