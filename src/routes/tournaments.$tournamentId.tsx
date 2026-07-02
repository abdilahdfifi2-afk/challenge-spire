import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { gameCover, pickBanner, TOURNAMENT_BANNERS } from "@/lib/media";
import { translateFinancialError } from "@/lib/rpc-errors";
import { Trophy, Users, ArrowRight, Crown, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/tournaments/$tournamentId")({
  head: () => ({ meta: [{ title: "تفاصيل البطولة — ArenaX" }] }),
  component: TournamentDetailPage,
});

function TournamentDetailPage() {
  const { tournamentId } = Route.useParams();
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const t = useQuery({
    queryKey: ["tournament", tournamentId],
    queryFn: async () => (await supabase.from("tournaments").select("*, games(name,slug)").eq("id", tournamentId).maybeSingle()).data,
  });

  const parts = useQuery({
    queryKey: ["tournament-participants", tournamentId],
    queryFn: async () => {
      const { data } = await supabase.from("tournament_participants")
        .select("user_id, placement, profiles!tournament_participants_user_id_fkey(username, display_name, avatar_url)")
        .eq("tournament_id", tournamentId);
      return data ?? [];
    },
  });

  const matches = useQuery({
    queryKey: ["tournament-matches", tournamentId],
    queryFn: async () => {
      const { data } = await supabase.from("tournament_matches")
        .select("*")
        .eq("tournament_id", tournamentId)
        .order("round").order("position");
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`t-${tournamentId}-rt`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments", filter: `id=eq.${tournamentId}` },
        () => qc.invalidateQueries({ queryKey: ["tournament", tournamentId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_participants", filter: `tournament_id=eq.${tournamentId}` },
        () => qc.invalidateQueries({ queryKey: ["tournament-participants", tournamentId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "tournament_matches", filter: `tournament_id=eq.${tournamentId}` },
        () => qc.invalidateQueries({ queryKey: ["tournament-matches", tournamentId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [tournamentId, qc]);

  if (t.isLoading) return <div className="mx-auto max-w-6xl px-4 py-8 text-muted-foreground">جاري التحميل…</div>;
  if (!t.data) return <div className="mx-auto max-w-6xl px-4 py-8 card-elevated p-6 text-center">البطولة غير موجودة</div>;

  const tour: any = t.data;
  const participants = parts.data ?? [];
  const myEntry = user ? participants.find((p: any) => p.user_id === user.id) : null;
  const isFull = participants.length >= tour.max_players;
  const canJoin = user && tour.status === "open" && !myEntry && !isFull;

  const join = async () => {
    const { error } = await supabase.rpc("join_tournament", { _tournament_id: tour.id });
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    toast.success("تم التسجيل في البطولة");
  };

  const generate = async () => {
    if (!confirm("توليد المخطط الآن؟ لا يمكن التراجع بعد ذلك.")) return;
    const { error } = await supabase.rpc("generate_tournament_bracket", { _tournament_id: tour.id });
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    toast.success("تم إنشاء المخطط وبدأت البطولة");
  };

  const bannerUrl = tour.banner_url || gameCover(tour.games?.slug, tour.game_id) || pickBanner(TOURNAMENT_BANNERS, tour.id);
  const rounds = matches.data ? groupByRound(matches.data) : [];
  const canGenerate = (isAdmin || tour.created_by === user?.id) && tour.status === "open" && participants.length >= 2;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <button onClick={() => nav({ to: "/tournaments" })} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
        <ArrowRight className="h-4 w-4 rtl:rotate-180" /> رجوع للبطولات
      </button>

      <div className="card-elevated overflow-hidden mb-6">
        <div className="relative h-48">
          <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          <div className="absolute inset-0 flex items-end p-6">
            <div>
              <div className="text-xs text-accent mb-1">{tour.games?.name}</div>
              <h1 className="font-display text-3xl font-bold">{tour.title}</h1>
            </div>
          </div>
          <span className={`absolute top-4 end-4 text-xs px-3 py-1 rounded-full backdrop-blur ${statusColor(tour.status)}`}>{statusLabel(tour.status)}</span>
        </div>
        <div className="p-6">
          {tour.description && <p className="text-sm text-muted-foreground mb-4">{tour.description}</p>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Stat label="اللاعبون" value={`${participants.length} / ${tour.max_players}`} icon={<Users className="h-4 w-4" />} />
            <Stat label="الرسوم" value={formatCurrency(tour.entry_fee)} />
            <Stat label="مجموع الجوائز" value={<span className="text-neon font-bold">{formatCurrency(tour.prize_pool)}</span>} icon={<Trophy className="h-4 w-4 text-yellow-400" />} />
            <Stat label="تبدأ في" value={tour.starts_at ? formatDate(tour.starts_at) : "غير محدد"} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {canJoin && (
              <Button onClick={join} className="gradient-primary text-primary-foreground border-0 gap-2">
                <PlayCircle className="h-4 w-4" /> سجّل نفسك ({formatCurrency(tour.entry_fee)})
              </Button>
            )}
            {myEntry && tour.status === "open" && (
              <div className="text-sm text-success bg-success/10 border border-success/30 px-3 py-2 rounded-md">
                ✓ أنت مسجّل — بانتظار انطلاق البطولة
              </div>
            )}
            {isFull && tour.status === "open" && <div className="text-sm text-muted-foreground">البطولة مكتملة</div>}
            {canGenerate && (
              <Button onClick={generate} variant="outline" className="gap-2">
                <PlayCircle className="h-4 w-4" /> توليد المخطط وبدء البطولة
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-6">
        {/* Participants */}
        <div className="card-elevated p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" /> المشاركون ({participants.length})
          </h2>
          <div className="space-y-2">
            {participants.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد لاعبون بعد.</p>}
            {participants.map((p: any) => (
              <div key={p.user_id} className="flex items-center gap-2 text-sm">
                {p.placement === 1 && <Crown className="h-4 w-4 text-yellow-400" />}
                {p.profiles?.avatar_url ? (
                  <img src={p.profiles.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
                    {(p.profiles?.display_name || p.profiles?.username || "?").slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="truncate flex-1">{p.profiles?.display_name || p.profiles?.username}</span>
                {p.placement && <span className="text-xs text-muted-foreground">#{p.placement}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Bracket */}
        <div className="card-elevated p-5 overflow-x-auto">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" /> المخطط
          </h2>
          {rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">لم يُنشأ المخطط بعد.</p>
          ) : (
            <div className="flex gap-6 min-w-max">
              {rounds.map((round, rIdx) => (
                <div key={rIdx} className="flex flex-col justify-around gap-4 min-w-[220px]">
                  <div className="text-xs text-muted-foreground text-center font-semibold">
                    {roundLabel(rIdx + 1, rounds.length)}
                  </div>
                  {round.map((m: any) => (
                    <BracketMatch key={m.id} match={m} participants={participants} isAdmin={isAdmin} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function BracketMatch({ match, participants, isAdmin }: { match: any; participants: any[]; isAdmin: boolean }) {
  const getP = (id: string | null) => id ? participants.find((p: any) => p.user_id === id)?.profiles : null;
  const p1 = getP(match.player1_id);
  const p2 = getP(match.player2_id);
  const winner = match.winner_id;

  const submit = async (winnerId: string) => {
    if (!confirm("تأكيد الفائز؟")) return;
    const { error } = await supabase.rpc("submit_tournament_match", { _match_id: match.id, _winner: winnerId });
    if (error) toast.error(translateFinancialError(error.message));
    else toast.success("تم تسجيل النتيجة");
  };

  return (
    <div className={`rounded-md border overflow-hidden ${match.status === "completed" ? "border-success/40" : match.status === "ready" ? "border-primary/40" : "border-border"}`}>
      <PlayerRow p={p1} isWinner={winner === match.player1_id} isBye={match.status === "bye" && !p2}
        onClick={isAdmin && match.status === "ready" && match.player1_id ? () => submit(match.player1_id) : undefined} />
      <div className="h-px bg-border" />
      <PlayerRow p={p2} isWinner={winner === match.player2_id} isBye={match.status === "bye" && !p2}
        onClick={isAdmin && match.status === "ready" && match.player2_id ? () => submit(match.player2_id) : undefined} />
    </div>
  );
}

function PlayerRow({ p, isWinner, isBye, onClick }: { p: any; isWinner?: boolean; isBye?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm ${isWinner ? "bg-success/10 font-semibold" : ""} ${onClick ? "cursor-pointer hover:bg-primary/10" : ""}`}
    >
      {p ? (
        <>
          {p.avatar_url ? (
            <img src={p.avatar_url} className="h-6 w-6 rounded-full object-cover" alt="" />
          ) : (
            <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-semibold">
              {(p.display_name || p.username || "?").slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="truncate flex-1">{p.display_name || p.username}</span>
          {isWinner && <Trophy className="h-3 w-3 text-yellow-400" />}
        </>
      ) : (
        <span className="text-xs text-muted-foreground italic">{isBye ? "Bye" : "بانتظار…"}</span>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon} {label}</div>
      <div className="font-semibold mt-1">{value}</div>
    </div>
  );
}

function groupByRound(list: any[]) {
  const map = new Map<number, any[]>();
  for (const m of list) {
    if (!map.has(m.round)) map.set(m.round, []);
    map.get(m.round)!.push(m);
  }
  return [...map.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
}

function roundLabel(round: number, total: number) {
  const fromEnd = total - round;
  if (fromEnd === 0) return "النهائي";
  if (fromEnd === 1) return "نصف النهائي";
  if (fromEnd === 2) return "ربع النهائي";
  return `الجولة ${round}`;
}

function statusLabel(s: string) {
  const m: Record<string, string> = { draft: "مسودة", open: "مفتوحة للتسجيل", in_progress: "قيد التنفيذ", completed: "منتهية", cancelled: "ملغاة" };
  return m[s] ?? s;
}
function statusColor(s: string) {
  if (s === "open") return "bg-primary/20 text-primary";
  if (s === "in_progress") return "bg-warning/20 text-warning";
  if (s === "completed") return "bg-success/20 text-success";
  return "bg-muted text-muted-foreground";
}
