import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { ChallengeChat } from "@/components/challenge-chat";
import { formatCurrency, formatDate } from "@/lib/format";
import { gameCover } from "@/lib/media";
import { translateFinancialError } from "@/lib/rpc-errors";
import { ArrowRight, AlertTriangle, Trophy, XCircle, CheckCircle2, Timer, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/challenges/$challengeId")({
  head: () => ({ meta: [{ title: "تفاصيل التحدي — ArenaX" }] }),
  component: ChallengeDetailPage,
});

function ChallengeDetailPage() {
  const { challengeId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["challenge", challengeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("challenges")
        .select("*, games(name,slug)")
        .eq("id", challengeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const disputeQ = useQuery({
    queryKey: ["challenge-dispute", challengeId],
    queryFn: async () => {
      const { data } = await supabase.from("disputes").select("id,status").eq("challenge_id", challengeId).eq("status", "open").maybeSingle();
      return data;
    },
  });

  const partiesQ = useQuery({
    queryKey: ["challenge-parties", q.data?.creator_id, q.data?.opponent_id],
    enabled: !!q.data,
    queryFn: async () => {
      const ids = [q.data?.creator_id, q.data?.opponent_id].filter(Boolean) as string[];
      if (ids.length === 0) return {};
      const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
      return Object.fromEntries((data ?? []).map((p: any) => [p.id, p]));
    },
  });

  const myResultQ = useQuery({
    queryKey: ["challenge-my-result", challengeId, user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("match_results").select("id, claimed_winner, status").eq("challenge_id", challengeId).eq("submitted_by", user!.id).maybeSingle()).data,
  });

  useEffect(() => {
    const ch = supabase.channel(`challenge-${challengeId}-rt`)
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges", filter: `id=eq.${challengeId}` },
        () => qc.invalidateQueries({ queryKey: ["challenge", challengeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "disputes", filter: `challenge_id=eq.${challengeId}` },
        () => qc.invalidateQueries({ queryKey: ["challenge-dispute", challengeId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "match_results", filter: `challenge_id=eq.${challengeId}` },
        () => qc.invalidateQueries({ queryKey: ["challenge-my-result", challengeId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [challengeId, qc]);

  if (q.isLoading) return <div className="mx-auto max-w-6xl px-4 py-8 text-muted-foreground">جاري التحميل…</div>;
  if (!q.data) return <div className="mx-auto max-w-6xl px-4 py-8 card-elevated p-6 text-center">التحدي غير موجود</div>;

  const c = q.data as any;
  const parties = partiesQ.data ?? {};
  const creator = parties[c.creator_id];
  const opponent = c.opponent_id ? parties[c.opponent_id] : null;
  const isParticipant = user && (user.id === c.creator_id || user.id === c.opponent_id);
  const myResult = myResultQ.data;

  const openDispute = async () => {
    if (!user || !isParticipant) return;
    const reason = window.prompt("سبب فتح النزاع:") ?? "";
    if (!reason.trim()) return;
    const { error } = await supabase.from("disputes").insert({
      challenge_id: c.id,
      opened_by: user.id,
      status: "open",
      reason,
    });
    if (error) toast.error(error.message); else toast.success("تم فتح نزاع — سيراجعه الأدمن");
  };

  const cancelChallenge = async () => {
    if (!confirm("إلغاء التحدي واسترداد الرسوم؟")) return;
    const { error } = await supabase.rpc("cancel_challenge", { _challenge_id: c.id });
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    toast.success("تم الإلغاء وإعادة الرسوم إلى محفظتك");
  };

  const submitResult = async (winner: string) => {
    const { data, error } = await supabase.rpc("submit_challenge_result", { _challenge_id: c.id, _winner: winner });
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    qc.invalidateQueries({ queryKey: ["challenge-my-result", challengeId] });
    if (data === "settled") toast.success("تمت التسوية — تم توزيع الجائزة");
    else if (data === "disputed") toast.warning("اختلاف في النتائج — تم فتح نزاع تلقائياً");
    else toast.success("تم تسجيل نتيجتك — بانتظار الخصم");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <button onClick={() => navigate({ to: "/challenges" })} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
        <ArrowRight className="h-4 w-4 rtl:rotate-180" /> رجوع للتحديات
      </button>

      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-6">
        <div className="space-y-4">
          <div className="card-elevated overflow-hidden">
            <div className="relative h-40">
              <img src={gameCover(c.games?.slug, c.game_id)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-accent">{c.games?.name}</div>
                  <h1 className="font-display text-2xl font-bold mt-1">{c.title ?? "تحدي"}</h1>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColor(c.status)}`}>{statusLabel(c.status)}</span>
              </div>
              {c.description && <p className="text-sm text-muted-foreground mt-3">{c.description}</p>}

              <div className="grid grid-cols-2 gap-3 mt-5">
                <PlayerCard label="اللاعب الأول" p={creator} />
                <PlayerCard label="اللاعب الثاني" p={opponent} placeholder="بانتظار خصم" />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-muted-foreground">الرسوم</div><div className="font-semibold">{formatCurrency(c.entry_fee)}</div></div>
                <div><div className="text-xs text-muted-foreground">الجائزة</div><div className="font-bold text-neon">{formatCurrency(c.prize)}</div></div>
                <div className="col-span-2 text-xs text-muted-foreground">أُنشئ في {formatDate(c.created_at)}</div>
              </div>

              {isParticipant && c.status === "open" && user?.id === c.creator_id && (
                <div className="mt-4 space-y-2">
                  <InviteButton challengeId={c.id} />
                  <Button variant="outline" onClick={cancelChallenge} className="w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10">
                    <XCircle className="h-4 w-4" /> إلغاء التحدي واسترداد الرسوم
                  </Button>
                </div>
              )}

              {isParticipant && (c.status === "accepted" || (c.status === "in_progress" && c.match_started_at && new Date(c.match_started_at) > new Date())) && (
                <MatchLobby challenge={c} userId={user!.id} />
              )}

              {isParticipant && c.status === "in_progress" && c.match_started_at && new Date(c.match_started_at) <= new Date() && !disputeQ.data && (
                <div className="mt-5 rounded-md border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Trophy className="h-4 w-4 text-primary" /> تقديم نتيجة المباراة
                  </div>
                  {myResult ? (
                    <div className="text-xs text-muted-foreground">
                      قدّمت نتيجتك: الفائز = <span className="font-semibold text-foreground">{myResult.claimed_winner === c.creator_id ? (creator?.display_name || creator?.username) : (opponent?.display_name || opponent?.username)}</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground mb-3">اختر الفائز الحقيقي. إن اتفق الطرفان تُصرف الجائزة تلقائياً، وإلا يُفتح نزاع.</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button size="sm" onClick={() => submitResult(c.creator_id)}>ربح: {creator?.display_name || creator?.username || "المُنشئ"}</Button>
                        {c.opponent_id && <Button size="sm" onClick={() => submitResult(c.opponent_id)}>ربح: {opponent?.display_name || opponent?.username || "الخصم"}</Button>}
                      </div>
                    </>
                  )}
                </div>
              )}

              {isParticipant && c.status === "awaiting_confirmation" && !disputeQ.data && myResult && (
                <div className="mt-5 rounded-md border border-primary/30 bg-primary/5 p-4 text-xs text-muted-foreground">
                  قدّمت نتيجتك — بانتظار تأكيد الخصم…
                </div>
              )}

              {isParticipant && c.status === "awaiting_confirmation" && !disputeQ.data && !myResult && (
                <div className="mt-5 rounded-md border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                    <Trophy className="h-4 w-4 text-primary" /> خصمك قدّم نتيجة — أكّد أو اعترض
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" onClick={() => submitResult(c.creator_id)}>ربح: {creator?.display_name || creator?.username}</Button>
                    {c.opponent_id && <Button size="sm" onClick={() => submitResult(c.opponent_id)}>ربح: {opponent?.display_name || opponent?.username}</Button>}
                  </div>
                </div>
              )}

              {isParticipant && (c.status === "in_progress" || c.status === "awaiting_confirmation") && !disputeQ.data && (
                <Button variant="outline" onClick={openDispute} className="mt-3 w-full gap-2 border-destructive/40 text-destructive hover:bg-destructive/10">
                  <AlertTriangle className="h-4 w-4" /> فتح نزاع
                </Button>
              )}
              {disputeQ.data && (
                <div className="mt-4 rounded-md border border-warning/30 bg-warning/10 text-warning text-xs p-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" /> يوجد نزاع مفتوح — بانتظار مراجعة الأدمن.
                </div>
              )}
              {c.status === "completed" && (
                <div className="mt-4 rounded-md border border-success/30 bg-success/10 text-success text-xs p-3">تم إنهاء التحدي وتوزيع الجائزة.</div>
              )}
              {c.status === "cancelled" && (
                <div className="mt-4 rounded-md border border-muted bg-muted/30 text-muted-foreground text-xs p-3">تم إلغاء التحدي واسترداد الرسوم.</div>
              )}
            </div>
          </div>
        </div>

        <ChallengeChat
          challenge={{ id: c.id, creator_id: c.creator_id, opponent_id: c.opponent_id, status: c.status }}
          hasOpenDispute={!!disputeQ.data}
        />
      </div>
    </div>
  );
}

function PlayerCard({ label, p, placeholder }: { label: string; p: any; placeholder?: string }) {
  return (
    <div className="rounded-lg border border-border p-3 flex items-center gap-3">
      {p?.avatar_url ? (
        <img src={p.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <div className="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-semibold">
          {p ? (p.display_name || p.username || "?").slice(0, 2).toUpperCase() : "؟"}
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold truncate">{p ? (p.display_name || p.username) : (placeholder ?? "—")}</div>
      </div>
    </div>
  );
}

function MatchLobby({ challenge, userId }: { challenge: any; userId: string }) {
  const qc = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const isCreator = userId === challenge.creator_id;
  const myReady = isCreator ? !!challenge.creator_ready : !!challenge.opponent_ready;
  const otherReady = isCreator ? !!challenge.opponent_ready : !!challenge.creator_ready;
  const startAt = challenge.match_started_at ? new Date(challenge.match_started_at).getTime() : null;
  const countdown = startAt ? Math.max(0, Math.ceil((startAt - now) / 1000)) : null;

  useEffect(() => {
    if (!startAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startAt]);

  useEffect(() => {
    if (countdown === 0) {
      qc.invalidateQueries({ queryKey: ["challenge", challenge.id] });
    }
  }, [countdown, challenge.id, qc]);

  const toggle = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("set_challenge_ready", { _challenge_id: challenge.id, _ready: !myReady });
    setBusy(false);
    if (error) toast.error(translateFinancialError(error.message));
    else qc.invalidateQueries({ queryKey: ["challenge", challenge.id] });
  };

  return (
    <div className="mt-5 rounded-lg border border-primary/30 bg-gradient-to-br from-primary/10 to-accent/5 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" /> غرفة اللوبي
        </div>
        {countdown !== null && countdown > 0 && (
          <div className="text-2xl font-bold font-display text-primary tabular-nums animate-pulse">
            {countdown}s
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <ReadyBadge label="أنت" ready={myReady} />
        <ReadyBadge label="الخصم" ready={otherReady} />
      </div>

      {countdown !== null && countdown > 0 ? (
        <div className="text-center text-sm text-muted-foreground">
          الطرفان جاهزان — المباراة تبدأ خلال {countdown} ثانية…
        </div>
      ) : (
        <Button
          onClick={toggle}
          disabled={busy}
          variant={myReady ? "outline" : "default"}
          className={`w-full gap-2 ${myReady ? "" : "gradient-primary text-primary-foreground border-0"}`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {myReady ? "إلغاء الجاهزية" : "أنا جاهز"}
        </Button>
      )}
    </div>
  );
}

function ReadyBadge({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className={`rounded-md border p-3 text-center ${ready ? "border-success bg-success/10" : "border-border bg-muted/20"}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold mt-1 flex items-center justify-center gap-1 ${ready ? "text-success" : "text-muted-foreground"}`}>
        {ready ? <><CheckCircle2 className="h-4 w-4" /> جاهز</> : "غير جاهز"}
      </div>
    </div>
  );
}

function statusLabel(s: string) {
  const m: Record<string, string> = { open: "مفتوح", accepted: "في اللوبي", in_progress: "قيد التنفيذ", awaiting_confirmation: "بانتظار التأكيد", disputed: "نزاع", completed: "منتهي", cancelled: "ملغى" };
  return m[s] ?? s;
}
function statusColor(s: string) {
  if (s === "open") return "bg-primary/15 text-primary";
  if (s === "accepted") return "bg-accent/15 text-accent";
  if (s === "in_progress") return "bg-warning/15 text-warning";
  if (s === "completed") return "bg-success/15 text-success";
  if (s === "disputed" || s === "cancelled") return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}
