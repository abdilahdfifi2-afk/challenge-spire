import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { Target, Radio, Clock, Trophy, Users, Flame, TrendingUp, Zap, CheckCircle2 } from "lucide-react";

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

type MarketLite = {
  id: string; match_id: string; title: string; market_type: string;
  min_stake: number; max_stake: number; commission_pct: number;
  status: string; closes_at: string;
};

type Option = { id: string; market_id: string; label: string; sort_order: number };

type MarketAgg = { match_id: string; markets: number; entries: number; pool: number; nextClose: string | null };

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
    queryKey: ["pred-markets-list"],
    queryFn: async () => {
      const { data } = await supabase.from("match_markets").select("id, match_id, title, market_type, min_stake, max_stake, commission_pct, status, closes_at");
      return (data as MarketLite[]) ?? [];
    },
  });

  const optionsQ = useQuery({
    queryKey: ["pred-options-all"],
    queryFn: async () => {
      const { data } = await supabase.from("market_options").select("id, market_id, label, sort_order").order("sort_order");
      return (data as Option[]) ?? [];
    },
  });

  const entriesQ = useQuery({
    queryKey: ["pred-entries-sums"],
    queryFn: async () => {
      const { data } = await supabase.from("market_entries").select("market_id, option_id, amount");
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("predictions-hub")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => qc.invalidateQueries({ queryKey: ["pred-matches"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "match_markets" }, () => { qc.invalidateQueries({ queryKey: ["pred-markets-list"] }); qc.invalidateQueries({ queryKey: ["pred-options-all"] }); })
      .on("postgres_changes", { event: "*", schema: "public", table: "market_entries" }, () => qc.invalidateQueries({ queryKey: ["pred-entries-sums"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const aggByMatch = useMemo(() => {
    const map = new Map<string, MarketAgg>();
    const markets = marketsQ.data ?? [];
    const entries = entriesQ.data ?? [];
    const byMarket = new Map<string, MarketLite>();
    markets.forEach((m) => byMarket.set(m.id, m));
    markets.forEach((m) => {
      const cur = map.get(m.match_id) ?? { match_id: m.match_id, markets: 0, entries: 0, pool: 0, nextClose: null };
      cur.markets += 1;
      if (m.status === "open" && (!cur.nextClose || new Date(m.closes_at) < new Date(cur.nextClose))) cur.nextClose = m.closes_at;
      map.set(m.match_id, cur);
    });
    (entries as any[]).forEach((e) => {
      const info = byMarket.get(e.market_id); if (!info) return;
      const cur = map.get(info.match_id)!;
      cur.entries += 1; cur.pool += Number(e.amount) || 0;
    });
    return map;
  }, [marketsQ.data, entriesQ.data]);

  // main market per match (first open market) for card options
  const mainMarketByMatch = useMemo(() => {
    const map = new Map<string, MarketLite>();
    (marketsQ.data ?? [])
      .filter((m) => m.status === "open")
      .sort((a, b) => new Date(a.closes_at).getTime() - new Date(b.closes_at).getTime())
      .forEach((m) => { if (!map.has(m.match_id)) map.set(m.match_id, m); });
    return map;
  }, [marketsQ.data]);

  const optionsByMarket = useMemo(() => {
    const map = new Map<string, Option[]>();
    (optionsQ.data ?? []).forEach((o) => {
      const arr = map.get(o.market_id) ?? []; arr.push(o); map.set(o.market_id, arr);
    });
    return map;
  }, [optionsQ.data]);

  const stakesByOption = useMemo(() => {
    const map = new Map<string, number>();
    (entriesQ.data ?? []).forEach((e: any) => {
      map.set(e.option_id, (map.get(e.option_id) ?? 0) + Number(e.amount));
    });
    return map;
  }, [entriesQ.data]);

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

  const topByPool = useMemo(
    () => Array.from(aggByMatch.values()).sort((a, b) => b.pool - a.pool).slice(0, 3).filter((t) => t.pool > 0),
    [aggByMatch],
  );

  const totalPool = useMemo(() => Array.from(aggByMatch.values()).reduce((s, a) => s + a.pool, 0), [aggByMatch]);
  const totalEntries = useMemo(() => Array.from(aggByMatch.values()).reduce((s, a) => s + a.entries, 0), [aggByMatch]);
  const liveCount = useMemo(() => (matchesQ.data ?? []).filter((m) => m.status === "live").length, [matchesQ.data]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="glass p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-40 pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-xs text-primary/80 mb-2 font-semibold uppercase tracking-wider">
              <Zap className="h-3.5 w-3.5" /> ArenaX Predictions
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-glow">
              راهن على <span className="text-gradient-primary">أفضل المباريات</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-lg">
              أسواق حية على الرياضة والألعاب الإلكترونية — احسب مضاعفاتك وشارك بأي مبلغ.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat icon={Radio} label="مباشر" value={liveCount} color="text-red-400" />
            <Stat icon={Users} label="مشاركات" value={totalEntries} />
            <Stat icon={Trophy} label="الجوائز" value={formatCurrency(totalPool)} color="text-primary" />
          </div>
        </div>
      </motion.div>

      {/* Filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2 border border-border rounded-full p-1 glass-soft">
          {(["all", "sport", "esport"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`text-xs px-4 py-1.5 rounded-full transition font-semibold ${kind === k ? "gradient-primary text-primary-foreground shadow-lg" : "text-muted-foreground hover:text-foreground"}`}>
              {k === "all" ? "الكل" : k === "sport" ? "🏆 رياضة" : "🎮 إلكترونية"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 border-b border-border">
          {[
            { k: "live", label: "مباشر", icon: Radio },
            { k: "upcoming", label: "قادمة", icon: Clock },
            { k: "finished", label: "منتهية", icon: Trophy },
            { k: "all", label: "الكل", icon: Target },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k as any)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 transition ${tab === t.k ? "border-primary text-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top pool spotlight */}
      {topByPool.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase mb-2 tracking-wider">
            <Flame className="h-4 w-4 text-orange-400" /> الأعلى تداولاً
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {topByPool.map((t) => {
              const m = matchesQ.data?.find((x) => x.id === t.match_id);
              if (!m) return null;
              return (
                <Link key={t.match_id} to="/predictions/$matchId" params={{ matchId: t.match_id }}
                  className="glass p-4 flex items-center gap-3 hover:border-primary/60 hover:-translate-y-0.5 transition group">
                  <div className="h-10 w-10 rounded-full gradient-neon grid place-items-center shrink-0 glow-neon">
                    <Flame className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-muted-foreground uppercase truncate">{m.tournament || m.sport}</div>
                    <div className="text-sm font-semibold truncate group-hover:text-primary transition">{m.team1_name} vs {m.team2_name}</div>
                  </div>
                  <div className="text-end">
                    <div className="text-[10px] text-muted-foreground">مجموع</div>
                    <div className="text-sm font-bold text-primary font-mono">{formatCurrency(t.pool)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Matches list */}
      <div className="grid gap-4">
        {matchesQ.isLoading && (
          <div className="glass p-8 text-center text-muted-foreground">جاري التحميل…</div>
        )}
        {!matchesQ.isLoading && filtered.length === 0 && (
          <div className="glass p-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <div className="text-muted-foreground">لا توجد مباريات في هذه الفئة حالياً.</div>
          </div>
        )}
        <AnimatePresence mode="popLayout">
          {filtered.map((m, i) => {
            const agg = aggByMatch.get(m.id);
            const mainMk = mainMarketByMatch.get(m.id);
            const opts = mainMk ? (optionsByMarket.get(mainMk.id) ?? []) : [];
            return (
              <motion.div key={m.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.2) }}>
                <MatchCard m={m} agg={agg} mainMarket={mainMk} options={opts} stakesByOption={stakesByOption} />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color = "text-foreground" }: { icon: any; label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="glass-soft px-3 py-2 min-w-[90px]">
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground uppercase">
        <Icon className={`h-3 w-3 ${color}`} /> {label}
      </div>
      <div className={`font-bold font-mono text-sm mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function MatchCard({ m, agg, mainMarket, options, stakesByOption }: {
  m: Match; agg?: MarketAgg; mainMarket?: MarketLite; options: Option[]; stakesByOption: Map<string, number>;
}) {
  const status = m.status;
  const statusMeta = status === "live"
    ? { text: "● مباشر", cls: "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse" }
    : status === "scheduled"
    ? { text: "قادمة", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" }
    : status === "finished"
    ? { text: "منتهية", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
    : { text: "ملغاة", cls: "bg-muted text-muted-foreground border-border" };

  const pool = agg?.pool ?? 0;
  const optionStakes = options.map((o) => ({ o, stake: stakesByOption.get(o.id) ?? 0 }));
  const totalOptStake = optionStakes.reduce((s, x) => s + x.stake, 0);
  const commissionPct = mainMarket ? Number(mainMarket.commission_pct) : 10;

  const oddsFor = (optStake: number) => {
    if (totalOptStake <= 0) return 2.0;
    const net = totalOptStake * (1 - commissionPct / 100);
    return Math.max(1.01, net / Math.max(optStake, 1));
  };

  return (
    <Link to="/predictions/$matchId" params={{ matchId: m.id }}
      className="block glass p-5 hover:border-primary/60 transition group hover:shadow-[0_0_40px_-10px_var(--color-primary)]">
      {/* Top row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider ${statusMeta.cls}`}>
          {statusMeta.text}
        </span>
        <span className="text-xs text-muted-foreground font-semibold">
          {m.kind === "sport" ? "🏆" : "🎮"} {m.tournament || m.sport}
        </span>
        <span className="text-xs text-muted-foreground ms-auto flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {formatDate(m.start_time)}
        </span>
      </div>

      {/* Teams */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mb-4">
        <TeamSide name={m.team1_name} logo={m.team1_logo} />
        <div className="text-center px-2">
          <div className="text-2xl font-display font-black text-muted-foreground/60">VS</div>
          {agg?.nextClose && status !== "finished" && (
            <div className="mt-1"><MiniCountdown to={agg.nextClose} /></div>
          )}
        </div>
        <TeamSide name={m.team2_name} logo={m.team2_logo} reverse />
      </div>

      {/* Betting options preview (1X2 style) */}
      {options.length > 0 && mainMarket && (
        <div className={`grid gap-2 mb-3 ${options.length === 2 ? "grid-cols-2" : options.length === 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-4"}`}>
          {optionStakes.slice(0, 4).map(({ o, stake }) => (
            <div key={o.id}
              className="rounded-lg border border-border bg-background/40 backdrop-blur px-3 py-2 flex items-center justify-between gap-2 group-hover:border-primary/40 transition">
              <span className="text-xs text-muted-foreground truncate">{o.label}</span>
              <span className="font-mono font-bold text-primary text-sm">{oddsFor(stake).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom stats */}
      {agg && agg.markets > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3 border-t border-border/60 flex-wrap">
          <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" /> {agg.markets} سوق</span>
          <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {agg.entries} مشارك</span>
          {mainMarket && (
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> رهان {formatCurrency(mainMarket.min_stake)} - {formatCurrency(mainMarket.max_stake)}
            </span>
          )}
          <span className="ms-auto flex items-center gap-1 text-primary font-bold font-mono">
            <Trophy className="h-3.5 w-3.5" /> {formatCurrency(pool)}
          </span>
        </div>
      )}
      {(!agg || agg.markets === 0) && (
        <div className="text-xs text-muted-foreground text-center pt-3 border-t border-border/60">
          لم يتم إنشاء أسواق بعد لهذه المباراة.
        </div>
      )}
    </Link>
  );
}

function TeamSide({ name, logo, reverse }: { name: string; logo: string | null; reverse?: boolean }) {
  return (
    <div className={`flex items-center gap-3 min-w-0 ${reverse ? "flex-row-reverse" : ""}`}>
      <div className="h-14 w-14 rounded-full bg-muted grid place-items-center overflow-hidden shrink-0 border-2 border-border group-hover:border-primary/60 transition">
        {logo ? <img src={logo} alt={name} className="h-full w-full object-cover" />
          : <span className="text-xs font-bold text-muted-foreground">{name.slice(0, 2)}</span>}
      </div>
      <div className="min-w-0">
        <div className="font-bold truncate">{name}</div>
      </div>
    </div>
  );
}

function MiniCountdown({ to }: { to: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = Math.max(0, new Date(to).getTime() - now);
  if (diff <= 0) return <span className="text-[10px] text-red-400 font-mono">مغلق</span>;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const label = d > 0 ? `${d}ي ${h}س` : h > 0 ? `${h}س ${mm}د` : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
      <Clock className="h-2.5 w-2.5" /> {label}
    </span>
  );
}
