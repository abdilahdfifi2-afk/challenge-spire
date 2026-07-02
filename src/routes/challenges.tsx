import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { translateFinancialError } from "@/lib/rpc-errors";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { gameCover } from "@/lib/media";
import { Swords, Plus } from "lucide-react";

export const Route = createFileRoute("/challenges")({
  head: () => ({ meta: [{ title: "التحديات — ArenaX" }, { name: "description", content: "استعرض التحديات المفتوحة وانضم إليها." }] }),
  component: ChallengesPage,
});

function ChallengesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["challenges-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("challenges")
        .select("*, games(name,slug), creator:profiles!challenges_creator_id_fkey(username, display_name)")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("challenges-list-rt").on("postgres_changes",
      { event: "*", schema: "public", table: "challenges" },
      () => qc.invalidateQueries({ queryKey: ["challenges-list"] })
    ).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const accept = async (id: string, entryFee: number) => {
    if (!user) { toast.error("سجّل دخولك أولاً"); return; }
    // Check wallet
    const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", user.id).maybeSingle();
    if (Number(w?.balance ?? 0) < entryFee) { toast.error("رصيدك غير كافٍ لدخول هذا التحدي"); return; }
    const { error } = await supabase.from("challenges").update({
      opponent_id: user.id,
      status: "in_progress",
    }).eq("id", id).eq("status", "open");
    if (error) { toast.error(error.message); return; }
    toast.success("انضممت للتحدي — بالتوفيق!");
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-3xl font-bold flex items-center gap-2"><Swords className="h-7 w-7 text-primary" /> التحديات</h1>
          <p className="text-sm text-muted-foreground mt-1">تحدَّ لاعبين آخرين في مباريات مباشرة.</p>
        </div>
        <Link to={user ? "/challenges/create" : "/auth"}>
          <Button className="gradient-primary text-primary-foreground border-0 glow-primary gap-2">
            <Plus className="h-4 w-4" /> إنشاء تحدي
          </Button>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(list.data ?? []).length === 0 && (
          <div className="card-elevated p-8 text-center text-muted-foreground col-span-full">
            لا توجد تحديات بعد. كن أول من ينشئ تحدياً!
          </div>
        )}
        {list.data?.map((c: any) => (
          <div key={c.id} className="card-elevated overflow-hidden group">
            <Link to="/challenges/$challengeId" params={{ challengeId: c.id }} className="block">
              <div className="relative h-36 overflow-hidden">
                <img src={gameCover(c.games?.slug, c.game_id)} alt={c.games?.name ?? "لعبة"} loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                <span className="absolute top-2 start-2 text-xs text-accent font-semibold bg-background/60 backdrop-blur px-2 py-0.5 rounded">{c.games?.name}</span>
                <span className={`absolute top-2 end-2 text-[10px] px-2 py-0.5 rounded-full backdrop-blur ${statusColor(c.status)}`}>{statusLabel(c.status)}</span>
              </div>
            </Link>
            <div className="p-5">
              <Link to="/challenges/$challengeId" params={{ challengeId: c.id }}>
                <h3 className="font-semibold hover:text-primary transition-colors">{c.title ?? "تحدي بدون عنوان"}</h3>
              </Link>
              <p className="text-xs text-muted-foreground mt-1">من: {c.creator?.display_name ?? c.creator?.username}</p>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs">
                  <div className="text-muted-foreground">الرسوم</div>
                  <div className="font-semibold">{formatCurrency(c.entry_fee)}</div>
                </div>
                <div className="text-xs text-end">
                  <div className="text-muted-foreground">الجائزة</div>
                  <div className="font-bold text-neon">{formatCurrency(c.prize)}</div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs gap-2">
                <span className="text-muted-foreground">{formatDate(c.created_at)}</span>
                <div className="flex items-center gap-2">
                  <Link to="/challenges/$challengeId" params={{ challengeId: c.id }}>
                    <Button size="sm" variant="outline">التفاصيل</Button>
                  </Link>
                  {c.status === "open" && user && user.id !== c.creator_id && (
                    <Button size="sm" onClick={() => accept(c.id, Number(c.entry_fee))}>قبول</Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function statusLabel(s: string) {
  const m: Record<string, string> = { open: "مفتوح", accepted: "مقبول", in_progress: "قيد التنفيذ", awaiting_confirmation: "بانتظار التأكيد", disputed: "نزاع", completed: "منتهي", cancelled: "ملغى" };
  return m[s] ?? s;
}
function statusColor(s: string) {
  if (s === "open") return "bg-primary/15 text-primary";
  if (s === "in_progress") return "bg-warning/15 text-warning";
  if (s === "completed") return "bg-success/15 text-success";
  if (s === "disputed") return "bg-destructive/15 text-destructive";
  return "bg-muted text-muted-foreground";
}
