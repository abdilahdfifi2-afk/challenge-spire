import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { translateFinancialError } from "@/lib/rpc-errors";
import { Button } from "@/components/ui/button";
import { Target, Radio, Clock, Trophy, Users, ArrowLeft, CheckCircle2, XCircle, Lock, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/predictions/$matchId")({
  head: ({ params }) => ({
    meta: [{ title: `مباراة توقعات — ArenaX` }, { name: "description", content: `شارك في أسواق توقعات المباراة على ArenaX.` }],
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
    queryKey: ["market-entries", matchId, user?.id, marketIds.join(",")],
    enabled: marketIds.length > 0,
    queryFn: async () => {
      const q = supabase.from("market_entries").select("market_id, option_id, amount, is_winner, payout, user_id").in("market_id", marketIds);
      const { data } = await q;
      return data ?? [];
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

  if (matchQ.isLoading) return <div className="mx-auto max-w-4xl p-8 text-center text-muted-foreground">جاري التحميل…</div>;
  if (!matchQ.data) return <div className="mx-auto max-w-4xl p-8 text-center">المباراة غير موجودة.</div>;

  const m = matchQ.data as any;
  const markets = marketsQ.data ?? [];
  const options = optionsQ.data ?? [];
  const entries = entriesQ.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <Link to="/predictions" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> رجوع للتوقعات
      </Link>

      <div className="card-elevated p-6">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase border ${m.status === "live" ? "bg-red-500/20 text-red-400 border-red-500/40" : m.status === "scheduled" ? "bg-blue-500/20 text-blue-400 border-blue-500/40" : "bg-muted text-muted-foreground border-border"}`}>
            {m.status === "live" ? "● مباشر" : m.status === "scheduled" ? "قادمة" : m.status === "finished" ? "منتهية" : "ملغاة"}
          </span>
          <span className="text-xs text-muted-foreground">{m.kind === "sport" ? "🏆 " : "🎮 "}{m.tournament || m.sport}</span>
          <span className="text-xs text-muted-foreground ms-auto flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDate(m.start_time)}</span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <TeamBig name={m.team1_name} logo={m.team1_logo} />
          <div className="text-center"><div className="text-3xl font-bold text-muted-foreground">VS</div></div>
          <TeamBig name={m.team2_name} logo={m.team2_logo} reverse />
        </div>
        {m.status === "scheduled" && new Date(m.start_time) > new Date() && (
          <div className="mt-4 text-center"><Countdown to={m.start_time} /></div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-display font-bold flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" /> أسواق التوقعات ({markets.length})
        </h2>
        {markets.length === 0 && <div className="card-elevated p-6 text-center text-muted-foreground">لا توجد أسواق مفتوحة بعد.</div>}
        {markets.map((mk) => {
          const opts = options.filter((o) => o.market_id === mk.id);
          const myEntry = user ? entries.find((e: any) => e.market_id === mk.id && e.user_id === user.id) : null;
          const marketEntries = entries.filter((e: any) => e.market_id === mk.id);
          return <MarketCard key={mk.id} market={mk} options={opts} myEntry={myEntry as any} marketEntries={marketEntries} />;
        })}
      </div>
    </div>
  );
}

function TeamBig({ name, logo, reverse }: { name: string; logo: string | null; reverse?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 ${reverse ? "" : ""}`}>
      <div className="h-20 w-20 rounded-full bg-muted grid place-items-center overflow-hidden border-2 border-border">
        {logo ? <img src={logo} alt={name} className="h-full w-full object-cover" /> : <span className="text-lg font-bold text-muted-foreground">{name.slice(0, 2)}</span>}
      </div>
      <div className="font-semibold text-center">{name}</div>
    </div>
  );
}

function MarketCard({ market, options, myEntry, marketEntries }: {
  market: Market; options: Option[]; myEntry: any; marketEntries: any[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [stake, setStake] = useState<number>(Number(market.min_stake) || 10);
  const closesInMs = new Date(market.closes_at).getTime() - Date.now();
  const isLocked = market.status !== "open" || closesInMs <= 0;
  const isSettled = market.status === "settled";
  const isRefunded = market.status === "refunded";

  const pool = marketEntries.reduce((s, e: any) => s + Number(e.amount), 0);
  const commission = pool * Number(market.commission_pct) / 100;
  const netPool = pool - commission;

  // Live odds per option (parimutuel-style estimate)
  const oddsFor = (optId: string) => {
    const optStake = marketEntries.filter((e: any) => e.option_id === optId).reduce((s, e: any) => s + Number(e.amount), 0);
    if (optStake <= 0) return 2.0; // opening odds
    // if my prospective stake was on this option: (netPool + stake*0.9) / (optStake + stake)
    const projectedNet = (pool + stake) * (1 - Number(market.commission_pct) / 100);
    return Math.max(1.01, projectedNet / (optStake + stake));
  };

  const place = async () => {
    if (!user) { toast.error("سجّل الدخول للمشاركة"); return; }
    if (!selected) { toast.error("اختر توقعك أولاً"); return; }
    if (stake < Number(market.min_stake) || stake > Number(market.max_stake)) {
      toast.error(`المبلغ يجب أن يكون بين ${market.min_stake} و ${market.max_stake} د.م`); return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("place_prediction", { _market_id: market.id, _option_id: selected, _stake: stake });
    setBusy(false);
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    toast.success("تم تسجيل رهانك ✓");
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["market-entries"] });
    qc.invalidateQueries({ queryKey: ["wallet"] });
  };

  const statusBadge = isSettled ? { text: "تمت التسوية", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 }
    : isRefunded ? { text: "تعادل / استرداد", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: RotateCcw }
    : market.status === "closed" ? { text: "مغلق", cls: "bg-muted text-muted-foreground border-border", icon: Lock }
    : closesInMs <= 0 ? { text: "انتهى الوقت", cls: "bg-muted text-muted-foreground border-border", icon: Lock }
    : { text: "مفتوح", cls: "bg-primary/15 text-primary border-primary/30", icon: Radio };
  const StatusIcon = statusBadge.icon;
  const potentialWin = selected ? Math.round(stake * oddsFor(selected) * 100) / 100 : 0;

  return (
    <div className="card-elevated p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="font-semibold">{market.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            رهان: {formatCurrency(market.min_stake)} - {formatCurrency(market.max_stake)} · عمولة {market.commission_pct}%
          </div>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${statusBadge.cls}`}>
          <StatusIcon className="h-3 w-3" /> {statusBadge.text}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {marketEntries.length} مشارك</span>
        <span className="flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-primary" /> مجموع الرهانات: {formatCurrency(pool)}</span>
        <span className="text-emerald-400">صافي التوزيع ≈ {formatCurrency(netPool)}</span>
        {!isLocked && <Countdown to={market.closes_at} inline />}
      </div>

      <div className="grid gap-2">
        {options.map((o) => {
          const isMy = myEntry?.option_id === o.id;
          const isWinning = isSettled && market.winning_option_id === o.id;
          const isLosing = isSettled && myEntry?.option_id === o.id && market.winning_option_id !== o.id;
          const isSel = selected === o.id;
          const odds = oddsFor(o.id);
          const optStake = marketEntries.filter((e: any) => e.option_id === o.id).reduce((s, e: any) => s + Number(e.amount), 0);
          return (
            <button
              key={o.id}
              type="button"
              disabled={isLocked || !!myEntry}
              onClick={() => setSelected(o.id)}
              className={`w-full text-start rounded-lg border p-3 flex items-center justify-between gap-3 transition disabled:cursor-not-allowed ${isWinning ? "border-emerald-500/60 bg-emerald-500/10" : isLosing ? "border-red-500/40 bg-red-500/5 opacity-70" : isMy ? "border-primary/60 bg-primary/5" : isSel ? "border-primary bg-primary/10 ring-2 ring-primary/40" : "border-border hover:border-primary/40"}`}
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isWinning && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                {isLosing && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                <span className="font-medium truncate">{o.label}</span>
                {isMy && !isSettled && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/20 text-primary">اختيارك</span>}
                <span className="text-[10px] text-muted-foreground ms-auto">{formatCurrency(optStake)}</span>
              </div>
              <div className="text-end shrink-0">
                <div className={`font-mono font-bold text-lg ${isSel ? "text-primary" : "text-foreground"}`}>{odds.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">مضاعف</div>
              </div>
              {isSettled && isMy && (
                <span className={`text-sm font-bold ${isWinning ? "text-emerald-400" : "text-red-400"}`}>
                  {isWinning ? `+${formatCurrency(myEntry.payout)}` : `-${formatCurrency(myEntry.amount)}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!myEntry && !isLocked && selected && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-xs font-semibold text-muted-foreground">مبلغ الرهان (د.م):</label>
            <input
              type="number"
              min={market.min_stake}
              max={market.max_stake}
              step="1"
              value={stake}
              onChange={(e) => setStake(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm font-mono"
            />
            <div className="flex gap-1">
              {[market.min_stake, market.min_stake * 2, market.min_stake * 5, market.max_stake].map((v, i) => (
                <button key={i} type="button" onClick={() => setStake(Number(v))} className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-muted/80 border border-border">
                  {Number(v)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">الربح المحتمل</div>
              <div className="font-bold text-emerald-400 text-lg">{formatCurrency(potentialWin)}</div>
            </div>
            <Button onClick={place} disabled={busy} size="lg" className="gradient-primary text-primary-foreground border-0">
              {busy ? "…" : "تأكيد الرهان"}
            </Button>
          </div>
        </div>
      )}

      {myEntry && !isSettled && !isRefunded && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> رهانك: {formatCurrency(myEntry.amount)} — بانتظار النتيجة.
        </div>
      )}
    </div>
  );
}


function Countdown({ to, inline }: { to: string; inline?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const diff = Math.max(0, new Date(to).getTime() - now);
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const label = d > 0 ? `${d}ي ${h}س` : h > 0 ? `${h}س ${mm}د` : `${mm}:${String(ss).padStart(2, "0")}`;
  if (inline) return <span className="flex items-center gap-1 ms-auto"><Clock className="h-3.5 w-3.5" /> يغلق خلال {label}</span>;
  return <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/30 font-mono text-sm"><Clock className="h-4 w-4" /> يبدأ خلال {label}</div>;
}
