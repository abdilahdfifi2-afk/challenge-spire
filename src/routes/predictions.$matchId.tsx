import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { translateFinancialError } from "@/lib/rpc-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Target, Radio, Clock, Trophy, Users, ArrowLeft, CheckCircle2, XCircle, Lock,
  RotateCcw, TrendingUp, Wallet, Sparkles, History,
} from "lucide-react";

export const Route = createFileRoute("/predictions/$matchId")({
  head: () => ({
    meta: [
      { title: `مباراة توقعات — ArenaX` },
      { name: "description", content: `شارك في أسواق توقعات المباراة على ArenaX.` },
    ],
  }),
  component: MatchPage,
});

type Market = {
  id: string; match_id: string; title: string; market_type: string;
  entry_fee: number; min_stake: number; max_stake: number; commission_pct: number;
  status: "open" | "closed" | "settled" | "cancelled" | "refunded";
  closes_at: string; winning_option_id: string | null;
};

type Option = { id: string; market_id: string; label: string; sort_order: number };
type Entry = { id?: string; market_id: string; option_id: string; amount: number; user_id: string; is_winner: boolean | null; payout: number | null; created_at?: string };

function MatchPage() {
  const { matchId } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();

  const matchQ = useQuery({
    queryKey: ["match", matchId],
    queryFn: async () => (await supabase.from("matches").select("*").eq("id", matchId).maybeSingle()).data,
  });

  const marketsQ = useQuery({
    queryKey: ["match-markets", matchId],
    queryFn: async () => (await supabase.from("match_markets").select("*").eq("match_id", matchId).order("created_at", { ascending: true })).data as Market[] | null,
  });

  const marketIds = useMemo(() => (marketsQ.data ?? []).map((m) => m.id), [marketsQ.data]);

  const optionsQ = useQuery({
    queryKey: ["market-options", matchId, marketIds.join(",")],
    enabled: marketIds.length > 0,
    queryFn: async () => (await supabase.from("market_options").select("*").in("market_id", marketIds).order("sort_order")).data as Option[] | null,
  });

  const entriesQ = useQuery({
    queryKey: ["market-entries", matchId, marketIds.join(",")],
    enabled: marketIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("market_entries")
        .select("id, market_id, option_id, amount, is_winner, payout, user_id, created_at")
        .in("market_id", marketIds)
        .order("created_at", { ascending: false });
      return (data ?? []) as Entry[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`match-${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_markets", filter: `match_id=eq.${matchId}` }, () => qc.invalidateQueries({ queryKey: ["match-markets", matchId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "market_entries" }, () => qc.invalidateQueries({ queryKey: ["market-entries", matchId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, () => qc.invalidateQueries({ queryKey: ["match", matchId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId, qc]);

  if (matchQ.isLoading) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="glass p-12 text-center text-muted-foreground animate-pulse">جاري التحميل…</div>
      </div>
    );
  }
  if (!matchQ.data) return <div className="mx-auto max-w-4xl p-8 text-center">المباراة غير موجودة.</div>;

  const m = matchQ.data as any;
  const markets = marketsQ.data ?? [];
  const options = optionsQ.data ?? [];
  const entries = entriesQ.data ?? [];

  const totalPool = entries.reduce((s, e) => s + Number(e.amount), 0);
  const totalParticipants = new Set(entries.map((e) => e.user_id)).size;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <Link to="/predictions" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 group">
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" /> رجوع للتوقعات
      </Link>

      {/* Match Hero */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="glass p-6 md:p-8 relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero opacity-30 pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <MatchStatusBadge status={m.status} />
            <span className="text-xs text-muted-foreground font-semibold">
              {m.kind === "sport" ? "🏆" : "🎮"} {m.tournament || m.sport}
            </span>
            <span className="text-xs text-muted-foreground ms-auto flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {formatDate(m.start_time)}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-8">
            <TeamBig name={m.team1_name} logo={m.team1_logo} />
            <div className="text-center">
              <div className="text-4xl md:text-5xl font-display font-black text-gradient-primary">VS</div>
              {m.status === "scheduled" && new Date(m.start_time) > new Date() && (
                <div className="mt-3"><Countdown to={m.start_time} /></div>
              )}
            </div>
            <TeamBig name={m.team2_name} logo={m.team2_logo} reverse />
          </div>

          {/* Match-level stats */}
          <div className="grid grid-cols-3 gap-3 mt-6 pt-6 border-t border-border/60">
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground uppercase mb-1">أسواق</div>
              <div className="font-bold font-mono text-lg text-foreground">{markets.length}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground uppercase mb-1">مشاركون</div>
              <div className="font-bold font-mono text-lg text-accent">{totalParticipants}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-muted-foreground uppercase mb-1">صندوق الجوائز</div>
              <div className="font-bold font-mono text-lg text-primary">{formatCurrency(totalPool)}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Markets */}
      <div className="space-y-4">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" /> أسواق التوقعات
          <span className="text-xs text-muted-foreground font-normal">({markets.length})</span>
        </h2>
        {markets.length === 0 && (
          <div className="glass p-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <div className="text-muted-foreground">لا توجد أسواق مفتوحة بعد.</div>
          </div>
        )}
        <div className="grid gap-4">
          {markets.map((mk, i) => {
            const opts = options.filter((o) => o.market_id === mk.id);
            const myEntry = user ? entries.find((e) => e.market_id === mk.id && e.user_id === user.id) : null;
            const marketEntries = entries.filter((e) => e.market_id === mk.id);
            return (
              <motion.div key={mk.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <MarketCard market={mk} options={opts} myEntry={myEntry ?? null} marketEntries={marketEntries} />
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MatchStatusBadge({ status }: { status: string }) {
  const meta = status === "live"
    ? { text: "● مباشر", cls: "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse" }
    : status === "scheduled"
    ? { text: "قادمة", cls: "bg-blue-500/15 text-blue-400 border-blue-500/40" }
    : status === "finished"
    ? { text: "منتهية", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
    : { text: "ملغاة", cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold uppercase tracking-wider ${meta.cls}`}>
      {meta.text}
    </span>
  );
}

function TeamBig({ name, logo, reverse }: { name: string; logo: string | null; reverse?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${reverse ? "" : ""}`}>
      <div className="h-24 w-24 md:h-28 md:w-28 rounded-full bg-muted grid place-items-center overflow-hidden border-2 border-primary/40 shadow-[0_0_30px_-5px_var(--color-primary)] transition hover:scale-105">
        {logo ? <img src={logo} alt={name} className="h-full w-full object-cover" />
          : <span className="text-xl font-bold text-muted-foreground">{name.slice(0, 2)}</span>}
      </div>
      <div className="font-bold text-center text-base md:text-lg">{name}</div>
    </div>
  );
}

function MarketCard({ market, options, myEntry, marketEntries }: {
  market: Market; options: Option[]; myEntry: Entry | null; marketEntries: Entry[];
}) {
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const closesInMs = new Date(market.closes_at).getTime() - Date.now();
  const isLocked = market.status !== "open" || closesInMs <= 0;
  const isSettled = market.status === "settled";
  const isRefunded = market.status === "refunded";

  const pool = marketEntries.reduce((s, e) => s + Number(e.amount), 0);
  const commission = pool * Number(market.commission_pct) / 100;
  const netPool = pool - commission;

  const stakesByOption = useMemo(() => {
    const map = new Map<string, { stake: number; count: number }>();
    marketEntries.forEach((e) => {
      const cur = map.get(e.option_id) ?? { stake: 0, count: 0 };
      cur.stake += Number(e.amount); cur.count += 1;
      map.set(e.option_id, cur);
    });
    return map;
  }, [marketEntries]);

  const oddsFor = (optId: string) => {
    const optStake = stakesByOption.get(optId)?.stake ?? 0;
    if (optStake <= 0) return 2.0;
    const net = pool * (1 - Number(market.commission_pct) / 100);
    return Math.max(1.01, net / optStake);
  };

  const percentFor = (optId: string) => {
    if (pool <= 0) return 0;
    const optStake = stakesByOption.get(optId)?.stake ?? 0;
    return (optStake / pool) * 100;
  };

  const openBet = (optId: string) => {
    if (!user) { toast.error("سجّل الدخول للمشاركة"); return; }
    if (isLocked) { toast.error("السوق مغلق"); return; }
    if (myEntry) { toast.error("شاركت في هذا السوق مسبقاً"); return; }
    setSelected(optId); setModalOpen(true);
  };

  const statusBadge = isSettled ? { text: "تمت التسوية", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 }
    : isRefunded ? { text: "استرداد", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: RotateCcw }
    : market.status === "closed" ? { text: "مغلق", cls: "bg-muted text-muted-foreground border-border", icon: Lock }
    : closesInMs <= 0 ? { text: "انتهى الوقت", cls: "bg-muted text-muted-foreground border-border", icon: Lock }
    : { text: "مفتوح", cls: "bg-primary/15 text-primary border-primary/40", icon: Radio };
  const StatusIcon = statusBadge.icon;

  const optionsCount = options.length;
  const gridCols = optionsCount === 2 ? "grid-cols-2" : optionsCount === 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-3";

  const selectedOption = options.find((o) => o.id === selected);

  return (
    <div className="glass p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-bold text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> {market.title}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> رهان {formatCurrency(market.min_stake)} - {formatCurrency(market.max_stake)}</span>
            <span>عمولة {market.commission_pct}%</span>
          </div>
        </div>
        <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold flex items-center gap-1 ${statusBadge.cls}`}>
          <StatusIcon className="h-3 w-3" /> {statusBadge.text}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap px-3 py-2 rounded-lg bg-background/30 border border-border/60">
        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {marketEntries.length} مشارك</span>
        <span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-primary" /> {formatCurrency(pool)}</span>
        <span className="text-emerald-400">صافي: {formatCurrency(netPool)}</span>
        {!isLocked && <span className="ms-auto"><Countdown to={market.closes_at} inline /></span>}
      </div>

      {/* Options grid — 1xBet-style big buttons */}
      <div className={`grid gap-3 ${gridCols}`}>
        {options.map((o) => {
          const isMy = myEntry?.option_id === o.id;
          const isWinning = isSettled && market.winning_option_id === o.id;
          const isLosing = isSettled && myEntry?.option_id === o.id && market.winning_option_id !== o.id;
          const odds = oddsFor(o.id);
          const pct = percentFor(o.id);
          const optAgg = stakesByOption.get(o.id);

          return (
            <button key={o.id} type="button"
              disabled={isLocked || !!myEntry}
              onClick={() => openBet(o.id)}
              className={`relative overflow-hidden rounded-xl border-2 p-4 text-start transition disabled:cursor-not-allowed group
                ${isWinning ? "border-emerald-500/70 bg-emerald-500/10 shadow-[0_0_25px_-5px_var(--color-success)]"
                : isLosing ? "border-red-500/40 bg-red-500/5 opacity-70"
                : isMy ? "border-primary/70 bg-primary/10"
                : !isLocked && !myEntry ? "border-border bg-card/60 hover:border-primary/60 hover:bg-primary/5 hover:-translate-y-0.5 hover:shadow-[0_0_25px_-5px_var(--color-primary)] cursor-pointer"
                : "border-border bg-card/40"}`}>
              {/* Percentage bar */}
              {pool > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className={`absolute inset-y-0 start-0 ${isMy ? "bg-primary/10" : "bg-primary/5"} transition-all`} style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="relative flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isWinning && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                  {isLosing && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                  <span className="font-bold truncate">{o.label}</span>
                </div>
                <div className="font-mono font-black text-2xl text-primary shrink-0 group-hover:text-gradient-primary transition">
                  {odds.toFixed(2)}
                </div>
              </div>
              <div className="relative flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{optAgg?.count ?? 0} رهان · {formatCurrency(optAgg?.stake ?? 0)}</span>
                <span className="font-mono">{pct.toFixed(0)}%</span>
              </div>
              {isMy && !isSettled && (
                <div className="relative mt-2 pt-2 border-t border-primary/30 text-[10px] text-primary font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> اختيارك — رهان {formatCurrency(myEntry!.amount)}
                </div>
              )}
              {isSettled && isMy && (
                <div className={`relative mt-2 pt-2 border-t text-xs font-bold ${isWinning ? "border-emerald-500/30 text-emerald-400" : "border-red-500/30 text-red-400"}`}>
                  {isWinning ? `+ ${formatCurrency(myEntry!.payout ?? 0)}` : `- ${formatCurrency(myEntry!.amount)}`}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Recent activity */}
      {marketEntries.length > 0 && (
        <RecentEntries entries={marketEntries.slice(0, 5)} options={options} />
      )}

      {/* Bet modal */}
      <BetModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        market={market}
        option={selectedOption ?? null}
        pool={pool}
        optionStake={selected ? (stakesByOption.get(selected)?.stake ?? 0) : 0}
      />
    </div>
  );
}

function RecentEntries({ entries, options }: { entries: Entry[]; options: Option[] }) {
  const optLabel = (id: string) => options.find((o) => o.id === id)?.label ?? "—";
  return (
    <div className="pt-3 border-t border-border/60">
      <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-2 flex items-center gap-1">
        <History className="h-3 w-3" /> آخر المشاركات
      </div>
      <div className="space-y-1">
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <motion.div key={e.id ?? `${e.user_id}-${e.option_id}`}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="flex items-center justify-between gap-2 text-xs px-2 py-1 rounded bg-background/30">
              <span className="text-muted-foreground truncate">
                <span className="text-foreground/80 font-mono">#{(e.user_id ?? "").slice(0, 6)}</span> راهن على <span className="text-primary font-semibold">{optLabel(e.option_id)}</span>
              </span>
              <span className="font-mono font-bold text-emerald-400 shrink-0">{formatCurrency(e.amount)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BetModal({ open, onOpenChange, market, option, pool, optionStake }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  market: Market;
  option: Option | null;
  pool: number;
  optionStake: number;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [stake, setStake] = useState<number>(Number(market.min_stake) || 10);
  const [busy, setBusy] = useState(false);

  const walletQ = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("balance, locked_balance").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    if (open) setStake(Number(market.min_stake) || 10);
  }, [open, market.min_stake]);

  const balance = Number(walletQ.data?.balance ?? 0);
  const locked = Number(walletQ.data?.locked_balance ?? 0);
  const available = Math.max(0, balance - locked);

  const commissionPct = Number(market.commission_pct);
  const projectedPool = pool + stake;
  const projectedNet = projectedPool * (1 - commissionPct / 100);
  const liveOdds = Math.max(1.01, projectedNet / Math.max(optionStake + stake, 1));
  const potentialWin = Math.round(stake * liveOdds * 100) / 100;
  const netProfit = Math.max(0, potentialWin - stake);
  const commissionOnMe = Math.round(stake * (commissionPct / 100) * 100) / 100;

  const minStake = Number(market.min_stake);
  const maxStake = Number(market.max_stake);
  const stakeTooLow = stake < minStake;
  const stakeTooHigh = stake > maxStake;
  const notEnough = stake > available;
  const invalid = !option || stakeTooLow || stakeTooHigh || notEnough || stake <= 0;

  const quickAmounts = [minStake, Math.round(minStake * 2), Math.round(minStake * 5), Math.min(maxStake, Math.round(minStake * 10)), maxStake]
    .filter((v, i, a) => a.indexOf(v) === i);

  const place = async () => {
    if (!user || !option) return;
    setBusy(true);
    const { error } = await supabase.rpc("place_prediction", { _market_id: market.id, _option_id: option.id, _stake: stake });
    setBusy(false);
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    toast.success(`تم تسجيل رهانك ✓ · ربح محتمل ${formatCurrency(potentialWin)}`);
    onOpenChange(false);
    qc.invalidateQueries({ queryKey: ["market-entries"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
    qc.invalidateQueries({ queryKey: ["pred-entries-sums"] });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass border-primary/30 max-w-md p-0 gap-0 overflow-hidden">
        {/* Header banner */}
        <div className="gradient-primary p-5 relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute -top-8 -end-8 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
          </div>
          <DialogHeader className="relative">
            <DialogTitle className="text-white flex items-center gap-2 font-display text-lg">
              <Sparkles className="h-5 w-5" /> تأكيد الرهان
            </DialogTitle>
            <DialogDescription className="text-white/85 text-xs">
              راجع تفاصيل الرهان قبل التأكيد.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-5 space-y-4">
          {/* Selection */}
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <div className="text-[10px] uppercase text-muted-foreground font-semibold mb-1">توقعك</div>
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold text-lg truncate">{option?.label ?? "—"}</div>
              <div className="text-end">
                <div className="text-[10px] text-muted-foreground">مضاعف حي</div>
                <div className="font-mono font-black text-primary text-xl">{liveOdds.toFixed(2)}</div>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 truncate">{market.title}</div>
          </div>

          {/* Wallet */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Wallet className="h-4 w-4 text-accent" /> رصيدك المتاح
            </div>
            <div className="font-mono font-bold text-accent">{formatCurrency(available)}</div>
          </div>

          {/* Stake input */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">مبلغ الرهان (د.م)</label>
            <Input
              type="number"
              inputMode="decimal"
              min={minStake}
              max={maxStake}
              step="1"
              value={stake}
              onChange={(e) => setStake(Math.max(0, parseFloat(e.target.value) || 0))}
              className={`text-lg font-mono font-bold text-center h-12 ${stakeTooLow || stakeTooHigh || notEnough ? "border-red-500/60 text-red-400" : "border-primary/40"}`}
            />
            <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-between">
              <span>الأدنى: {formatCurrency(minStake)}</span>
              <span>الأقصى: {formatCurrency(maxStake)}</span>
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {quickAmounts.map((v) => (
                <button key={v} type="button" onClick={() => setStake(v)}
                  className={`text-xs px-3 py-1 rounded-full border transition font-mono ${stake === v ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/60"}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-1.5 rounded-lg border border-border bg-background/40 p-3 text-sm">
            <Row label="مبلغ الرهان" value={formatCurrency(stake)} />
            <Row label={`العمولة (${commissionPct}%)`} value={formatCurrency(commissionOnMe)} muted />
            <div className="border-t border-border/60 my-1" />
            <Row label="الربح الصافي" value={formatCurrency(netProfit)} className="text-emerald-400" />
            <Row label="المبلغ المسترد" value={formatCurrency(potentialWin)} className="text-primary font-bold text-base" />
          </div>

          {/* Errors */}
          <AnimatePresence>
            {stakeTooLow && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-1.5">
                المبلغ أقل من الحد الأدنى ({formatCurrency(minStake)}).
              </motion.div>
            )}
            {stakeTooHigh && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-1.5">
                المبلغ أكبر من الحد الأقصى ({formatCurrency(maxStake)}).
              </motion.div>
            )}
            {notEnough && !stakeTooLow && !stakeTooHigh && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-md px-3 py-1.5">
                الرصيد المتاح غير كافٍ. اشحن محفظتك أو قلّل المبلغ.
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <DialogFooter className="p-5 pt-0 gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            إلغاء
          </Button>
          <Button onClick={place} disabled={busy || invalid}
            className="flex-1 gradient-primary text-primary-foreground border-0 font-bold h-11 disabled:opacity-40">
            {busy ? "جاري..." : `تأكيد · ${formatCurrency(stake)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, muted, className = "" }: { label: string; value: React.ReactNode; muted?: boolean; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-2 ${muted ? "text-muted-foreground" : ""}`}>
      <span className="text-xs">{label}</span>
      <span className={`font-mono ${className}`}>{value}</span>
    </div>
  );
}

function Countdown({ to, inline }: { to: string; inline?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = Math.max(0, new Date(to).getTime() - now);
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const label = d > 0 ? `${d}ي ${h}س` : h > 0 ? `${h}س ${mm}د` : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  if (inline) return <span className="flex items-center gap-1 text-amber-400"><Clock className="h-3.5 w-3.5" /> يغلق خلال {label}</span>;
  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full gradient-primary text-primary-foreground font-mono text-sm shadow-lg animate-pulse-glow">
      <Clock className="h-4 w-4" /> {label}
    </div>
  );
}
