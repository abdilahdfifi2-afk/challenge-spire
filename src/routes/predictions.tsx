import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { Target, Radio, Clock, Trophy, Users, Flame } from "lucide-react";

export const Route = createFileRoute("/predictions")({
  head: () => ({
    meta: [
      { title: "التوقعات الرياضية والإلكترونية — ArenaX" },
      { name: "description", content: "توقّع نتائج المباريات الرياضية والألعاب الإلكترونية على ArenaX، شارك في الأسواق واربح جوائز." },
    ],
  }),
  component: PredictionsHub,
});

type Match = {
  id: string; kind: "sport" | "esport"; sport: string; tournament: string | null;
  team1_name: string; team1_logo: string | null;
  team2_name: string; team2_logo: string | null;
  start_time: string; status: "scheduled" | "live" | "finished" | "cancelled";
};

type MarketAgg = { match_id: string; markets: number; entries: number; pool: number };

function PredictionsHub() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"live" | "upcoming" | "finished" | "all">("live");
  const [kind, setKind] = useState<"all" | "sport" | "esport">("all");

  const matchesQ = useQuery({
    queryKey: ["pred-matches"],
    queryFn: async (): Promise<Match[]> => {
      const { data } = await supabase.from("matches").select("*").order("start_time", { ascending: true });
      return (data as any) ?? [];
    },
  });

  const marketsQ = useQuery({
    queryKey: ["pred-markets-summary"],
    queryFn: async () => {
      const { data: markets } = await supabase.from("match_markets").select("id, match_id, entry_fee");
      const { data: entries } = await supabase.from("market_entries").select("market_id, amount");
      const byMarket = new Map<string, { match_id: string; fee: number }>();
      (markets ?? []).forEach((m: any) => byMarket.set(m.id, { match_id: m.match_id, fee: Number(m.entry_fee) }));
      const agg = new Map<string, MarketAgg>();
      (markets ?? []).forEach((m: any) => {
        const cur = agg.get(m.match_id) ?? { match_id: m.match_id, markets: 0, entries: 0, pool: 0 };
        cur.markets += 1; agg.set(m.match_id, cur);
      });
      (entries ?? []).forEach((e: any) => {
        const info = byMarket.get(e.market_id); if (!info) return;
        const cur = agg.get(info.match_id) ?? { match_id: info.match_id, markets: 0, entries: 0, pool: 0 };
        cur.entries += 1; cur.pool += Number(e.amount) || 0;
        agg.set(info.match_id, cur);
      });
      return agg;
    },
  });

  useEffect(() => {
    const ch = supabase.channel("predictions-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => qc.invalidateQueries({ queryKey: ["pred-matches"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "match_markets" }, () => qc.invalidateQueries({ queryKey: ["pred-markets-summary"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "market_entries" }, () => qc.invalidateQueries({ queryKey: ["pred-markets-summary"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const filtered = useMemo(() => {
    const all = matchesQ.data ?? [];
    return all.filter((m) => {
      if (kind !== "all" && m.kind !== kind) return false;
      if (tab === "all") return true;
      if (tab === "live") return m.status === "live";
      if (tab === "upcoming") return m.status === "scheduled";
      if (tab === "finished") return m.status === "finished";
      return true;
    });
  }, [matchesQ.data, tab, kind]);

  const topByPool = useMemo(() => {
    const arr = Array.from(marketsQ.data?.values() ?? []).sort((a, b) => b.pool - a.pool).slice(0, 3);
    return arr;
  }, [marketsQ.data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl font-bold flex items-center gap-2">
          <Target className="h-7 w-7 text-primary" /> التوقعات
        </h1>
        <div className="flex gap-2">
          {(["all", "sport", "esport"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`text-xs px-3 py-1.5 rounded-full border ${kind === k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {k === "all" ? "الكل" : k === "sport" ? "رياضة" : "إلكترونية"}
            </button>
          ))}
        </div>
      </div>

      {topByPool.length > 0 && (
        <div className="grid md:grid-cols-3 gap-3">
          {topByPool.map((t) => {
            const m = matchesQ.data?.find((x) => x.id === t.match_id);
            if (!m) return null;
            return (
              <Link key={t.match_id} to="/predictions/$matchId" params={{ matchId: t.match_id }}
                className="card-elevated p-4 flex items-center gap-3 hover:border-primary/50 transition">
                <Flame className="h-5 w-5 text-orange-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground truncate">{m.tournament || m.sport}</div>
                  <div className="text-sm font-semibold truncate">{m.team1_name} × {m.team2_name}</div>
                </div>
                <div className="text-left">
                  <div className="text-xs text-muted-foreground">مجموع</div>
                  <div className="text-sm font-bold text-primary">{formatCurrency(t.pool)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 border-b border-border">
        {[
          { k: "live", label: "مباشر", icon: Radio },
          { k: "upcoming", label: "قادمة", icon: Clock },
          { k: "finished", label: "منتهية", icon: Trophy },
          { k: "all", label: "الكل", icon: Target },
        ].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition ${tab === t.k ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        {matchesQ.isLoading && <div className="card-elevated p-8 text-center text-muted-foreground">جاري التحميل…</div>}
        {!matchesQ.isLoading && filtered.length === 0 && (
          <div className="card-elevated p-8 text-center text-muted-foreground">لا توجد مباريات في هذه الفئة.</div>
        )}
        {filtered.map((m) => {
          const agg = marketsQ.data?.get(m.id);
          return <MatchRow key={m.id} m={m} agg={agg} />;
        })}
      </div>
    </div>
  );
}

function MatchRow({ m, agg }: { m: Match; agg?: MarketAgg }) {
  const statusColor = m.status === "live" ? "bg-red-500/20 text-red-400 border-red-500/40"
    : m.status === "scheduled" ? "bg-blue-500/20 text-blue-400 border-blue-500/40"
    : m.status === "finished" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : "bg-muted text-muted-foreground border-border";
  return (
    <Link to="/predictions/$matchId" params={{ matchId: m.id }}
      className="card-elevated p-4 hover:border-primary/60 transition group">
      <div className="flex items-center gap-3 mb-3">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColor} font-semibold uppercase`}>
          {m.status === "live" ? "● مباشر" : m.status === "scheduled" ? "قادمة" : m.status === "finished" ? "منتهية" : "ملغاة"}
        </span>
        <span className="text-xs text-muted-foreground">{m.kind === "sport" ? "🏆 " : "🎮 "}{m.tournament || m.sport}</span>
        <span className="text-xs text-muted-foreground ms-auto">{formatDate(m.start_time)}</span>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <TeamSide name={m.team1_name} logo={m.team1_logo} />
        <div className="text-center px-3">
          <div className="text-xs text-muted-foreground">VS</div>
        </div>
        <TeamSide name={m.team2_name} logo={m.team2_logo} reverse />
      </div>
      {agg && agg.markets > 0 && (
        <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" /> {agg.markets} سوق</span>
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {agg.entries} مشارك</span>
          <span className="flex items-center gap-1 ms-auto text-primary font-semibold"><Trophy className="h-3.5 w-3.5" /> {formatCurrency(agg.pool)}</span>
        </div>
      )}
    </Link>
  );
}

function TeamSide({ name, logo, reverse }: { name: string; logo: string | null; reverse?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${reverse ? "flex-row-reverse text-left" : ""}`}>
      <div className="h-12 w-12 rounded-full bg-muted grid place-items-center overflow-hidden shrink-0 border border-border">
        {logo ? <img src={logo} alt={name} className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-muted-foreground">{name.slice(0, 2)}</span>}
      </div>
      <div className="min-w-0"><div className="font-semibold truncate">{name}</div></div>
    </div>
  );
}
