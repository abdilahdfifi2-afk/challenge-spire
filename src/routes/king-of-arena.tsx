import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Crown, Trophy, Medal, Flame } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/king-of-arena")({
  head: () => ({
    meta: [
      { title: "ملك الحلبة — ArenaX" },
      { name: "description", content: "تصنيف أفضل اللاعبين هذا الأسبوع حسب الأرباح والانتصارات." },
      { property: "og:title", content: "ملك الحلبة — ArenaX" },
      { property: "og:description", content: "تنافس على لقب ملك الحلبة الأسبوعي." },
    ],
  }),
  component: KingOfArenaPage,
});

function startOfWeekISO() {
  const d = new Date();
  const day = d.getDay(); // 0=Sunday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

function KingOfArenaPage() {
  const weekStart = startOfWeekISO();

  const q = useQuery({
    queryKey: ["king-of-arena", weekStart],
    queryFn: async () => {
      // Weekly winnings from wallet_transactions (challenge_win)
      const { data: winRows } = await supabase
        .from("wallet_transactions")
        .select("user_id, amount")
        .eq("type", "challenge_win")
        .gte("created_at", weekStart);

      const totals = new Map<string, { winnings: number; wins: number }>();
      for (const r of winRows ?? []) {
        const cur = totals.get(r.user_id) ?? { winnings: 0, wins: 0 };
        cur.winnings += Number(r.amount);
        cur.wins += 1;
        totals.set(r.user_id, cur);
      }

      const ids = [...totals.keys()];
      if (ids.length === 0) {
        // Fallback: overall top profiles
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url, wins, xp")
          .order("xp", { ascending: false })
          .limit(20);
        return (profs ?? []).map((p) => ({ ...p, winnings: 0, weekly_wins: p.wins ?? 0 }));
      }

      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, wins, xp")
        .in("id", ids);

      return (profs ?? [])
        .map((p) => ({ ...p, winnings: totals.get(p.id)!.winnings, weekly_wins: totals.get(p.id)!.wins }))
        .sort((a, b) => b.winnings - a.winnings)
        .slice(0, 20);
    },
  });

  const rows = q.data ?? [];
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs mb-3">
          <Flame className="h-3 w-3" /> تصنيف أسبوعي — يُعاد كل يوم إثنين
        </div>
        <h1 className="font-display text-4xl font-bold flex items-center justify-center gap-3">
          <Crown className="h-9 w-9 text-yellow-400" /> ملك الحلبة
        </h1>
        <p className="text-sm text-muted-foreground mt-2">أفضل اللاعبين حسب الأرباح هذا الأسبوع</p>
      </div>

      {q.isLoading && <div className="text-center text-muted-foreground py-12">جاري التحميل…</div>}

      {rows.length === 0 && !q.isLoading && (
        <div className="card-elevated p-12 text-center text-muted-foreground">
          لا توجد أرباح مسجّلة هذا الأسبوع بعد. كن أول من يحتل الصدارة!
        </div>
      )}

      {top3.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[1, 0, 2].map((i) => {
            const p = top3[i];
            if (!p) return <div key={i} />;
            const rank = i + 1;
            const heights = ["h-56", "h-64", "h-48"];
            const colors = ["from-slate-400/20 to-slate-400/5 border-slate-400/40", "from-yellow-400/20 to-yellow-400/5 border-yellow-400/50", "from-orange-500/20 to-orange-500/5 border-orange-500/40"];
            const icons = [<Medal key="s" className="h-6 w-6 text-slate-400" />, <Crown key="g" className="h-8 w-8 text-yellow-400" />, <Medal key="b" className="h-6 w-6 text-orange-500" />];
            return (
              <div key={p.id} className={`rounded-xl border bg-gradient-to-b ${colors[i]} ${heights[i]} p-4 flex flex-col items-center justify-end text-center`}>
                {icons[i]}
                {p.avatar_url ? (
                  <img src={p.avatar_url} className="h-16 w-16 rounded-full object-cover mt-3 ring-2 ring-primary/30" alt="" />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold mt-3">
                    {(p.display_name || p.username || "?").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="mt-2 font-semibold text-sm truncate w-full">{p.display_name || p.username}</div>
                <div className="text-xs text-muted-foreground mt-0.5">#{rank}</div>
                <div className="mt-2 font-bold text-neon">{formatCurrency(p.winnings)}</div>
                <div className="text-[10px] text-muted-foreground">{p.weekly_wins} انتصار</div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="card-elevated overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-start p-3 w-14">#</th>
                <th className="text-start p-3">اللاعب</th>
                <th className="text-end p-3">انتصارات الأسبوع</th>
                <th className="text-end p-3">الأرباح</th>
              </tr>
            </thead>
            <tbody>
              {rest.map((p, idx) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                  <td className="p-3 font-semibold text-muted-foreground">{idx + 4}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {p.avatar_url ? (
                        <img src={p.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
                          {(p.display_name || p.username || "?").slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium">{p.display_name || p.username}</span>
                    </div>
                  </td>
                  <td className="p-3 text-end">{p.weekly_wins}</td>
                  <td className="p-3 text-end font-bold text-neon">{formatCurrency(p.winnings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 text-center">
        <Link to="/challenges" className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <Trophy className="h-4 w-4" /> شارك في تحدٍ وارتقِ في التصنيف
        </Link>
      </div>
    </div>
  );
}
