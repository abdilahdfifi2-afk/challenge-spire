import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Trophy, Sparkles, Swords } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export const Route = createFileRoute("/feed")({
  head: () => ({
    meta: [
      { title: "التغذية الاجتماعية — ArenaX" },
      { name: "description", content: "آخر إنجازات وانتصارات لاعبي ArenaX." },
      { property: "og:title", content: "التغذية الاجتماعية — ArenaX" },
      { property: "og:description", content: "تابع نشاطات اللاعبين لحظة بلحظة." },
    ],
  }),
  component: FeedPage,
});

const ICONS: Record<string, typeof Activity> = {
  challenge_win: Swords,
  tournament_win: Trophy,
  achievement: Sparkles,
};

function FeedPage() {
  const q = useQuery({
    queryKey: ["activity-feed"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_feed")
        .select("id, user_id, type, title, body, meta, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      const items = data ?? [];
      const ids = [...new Set(items.map((i) => i.user_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return items.map((i) => ({ ...i, profile: map.get(i.user_id) }));
    },
    refetchInterval: 15000,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold flex items-center gap-3">
          <Activity className="h-7 w-7 text-primary" /> التغذية الاجتماعية
        </h1>
        <p className="text-muted-foreground mt-2">آخر إنجازات وانتصارات مجتمع ArenaX</p>
      </div>

      {q.isLoading && <div className="text-muted-foreground">جارٍ التحميل…</div>}
      {q.data && q.data.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">لا توجد نشاطات بعد</div>
      )}

      <div className="space-y-3">
        {(q.data ?? []).map((it) => {
          const Icon = ICONS[it.type] ?? Activity;
          const name = it.profile?.display_name ?? it.profile?.username ?? "لاعب";
          return (
            <div
              key={it.id}
              className="flex items-start gap-4 p-4 rounded-xl bg-card border border-border hover:border-primary/40 transition"
            >
              <div className="h-11 w-11 rounded-full gradient-primary grid place-items-center text-primary-foreground font-bold shrink-0">
                {it.profile?.avatar_url ? (
                  <img src={it.profile.avatar_url} alt={name} className="h-full w-full rounded-full object-cover" />
                ) : (
                  name.slice(0, 1)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{name}</span>
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="text-foreground">{it.title}</span>
                </div>
                {it.body && <p className="text-sm text-muted-foreground mt-1">{it.body}</p>}
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(it.created_at), { addSuffix: true, locale: ar })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
