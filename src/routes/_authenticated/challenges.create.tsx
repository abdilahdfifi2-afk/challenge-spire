import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import { translateFinancialError } from "@/lib/rpc-errors";

export const Route = createFileRoute("/_authenticated/challenges/create")({
  head: () => ({ meta: [{ title: "إنشاء تحدي — ArenaX" }] }),
  component: CreateChallengePage,
});

function CreateChallengePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const games = useQuery({
    queryKey: ["games-active"],
    queryFn: async () => (await supabase.from("games").select("id,name").eq("is_active", true).order("name")).data ?? [],
  });
  const settings = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => (await supabase.from("platform_settings").select("*").maybeSingle()).data,
  });
  const wallet = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("wallets").select("balance,locked_balance").eq("user_id", user!.id).maybeSingle()).data,
  });

  const [entryFee, setEntryFee] = useState("");
  const [loading, setLoading] = useState(false);

  const fee = parseFloat(entryFee) || 0;
  const commissionPct = Number(settings.data?.commission_pct ?? 10);
  const estimatedPrize = fee > 0 ? +(2 * fee * (1 - commissionPct / 100)).toFixed(2) : 0;
  const available = Number(wallet.data?.balance ?? 0) - Number(wallet.data?.locked_balance ?? 0);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { data, error } = await supabase.rpc("create_challenge_with_lock", {
      _game_id: String(fd.get("game_id")),
      _entry_fee: fee,
      _title: String(fd.get("title") || ""),
      _rules: String(fd.get("rules") || ""),
    });
    setLoading(false);
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    toast.success("تم نشر التحدي — حُجز مبلغ الرسوم من محفظتك");
    nav({ to: "/challenges/$challengeId", params: { challengeId: String(data) } });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-2">إنشاء تحدي جديد</h1>
      <p className="text-sm text-muted-foreground mb-6">
        عند إنشاء التحدي يُحجز مبلغ الرسوم من محفظتك، ويُحجز نفس المبلغ من خصمك عند القبول.
        الفائز يحصل على المجموع بعد خصم عمولة المنصة ({commissionPct}%).
      </p>

      <form onSubmit={submit} className="card-elevated p-6 space-y-4">
        <div>
          <Label>اللعبة</Label>
          <select name="game_id" required className="w-full h-10 rounded-md border border-input bg-transparent px-3">
            <option value="">اختر لعبة</option>
            {games.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div><Label>العنوان</Label><Input name="title" placeholder="مثال: تحدي 1v1 على FIFA" /></div>
        <div>
          <Label>رسوم الدخول (MAD)</Label>
          <Input
            name="entry_fee" type="number" step="0.01"
            min={settings.data?.min_challenge_fee ?? 5}
            max={settings.data?.max_challenge_fee ?? 10000}
            required value={entryFee} onChange={(e) => setEntryFee(e.target.value)}
          />
          {settings.data && (
            <p className="text-xs text-muted-foreground mt-1">
              من {formatCurrency(settings.data.min_challenge_fee)} إلى {formatCurrency(settings.data.max_challenge_fee)}
            </p>
          )}
        </div>
        {fee > 0 && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">رصيدك المتاح</span><span className={available < fee ? "text-destructive font-semibold" : "font-semibold"}>{formatCurrency(available)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">سيُحجز من محفظتك</span><span className="font-semibold">{formatCurrency(fee)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">جائزة الفائز (بعد العمولة)</span><span className="font-bold text-neon">{formatCurrency(estimatedPrize)}</span></div>
          </div>
        )}
        <div><Label>قوانين المباراة</Label><Textarea name="rules" rows={4} placeholder="اذكر شروط المباراة، المدة، وأي قواعد..." /></div>
        <Button disabled={loading || fee <= 0 || available < fee} className="w-full gradient-primary text-primary-foreground border-0">
          {loading ? "جاري النشر..." : "نشر التحدي"}
        </Button>
        {fee > 0 && available < fee && (
          <p className="text-xs text-destructive text-center">رصيدك المتاح لا يكفي. اذهب للمحفظة وقم بالإيداع.</p>
        )}
      </form>
    </div>
  );
}
