import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/disputes")({
  component: DisputesAdmin,
});

function DisputesAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: async () => (await supabase.from("disputes").select("*, challenges(id, title, prize, entry_fee, creator_id, opponent_id, games(name))").order("created_at", { ascending: false })).data ?? [],
  });

  const resolve = async (d: any, winnerId: string | null) => {
    // Pay winner or refund both
    const ch = d.challenges;
    if (winnerId) {
      const total = Number(ch.prize);
      const { data: wl } = await supabase.from("wallets").select("balance").eq("user_id", winnerId).maybeSingle();
      const nb = Number(wl?.balance ?? 0) + total;
      await supabase.from("wallets").update({ balance: nb }).eq("user_id", winnerId);
      await supabase.from("wallet_transactions").insert({ user_id: winnerId, type: "challenge_win", amount: total, status: "completed", reference_id: ch.id, description: `فوز في تحدي (بعد نزاع)`, balance_after: nb });
    } else {
      // Refund both
      for (const uid of [ch.creator_id, ch.opponent_id].filter(Boolean)) {
        const { data: wl } = await supabase.from("wallets").select("balance").eq("user_id", uid).maybeSingle();
        const nb = Number(wl?.balance ?? 0) + Number(ch.entry_fee);
        await supabase.from("wallets").update({ balance: nb }).eq("user_id", uid);
        await supabase.from("wallet_transactions").insert({ user_id: uid, type: "refund", amount: ch.entry_fee, status: "completed", reference_id: ch.id, description: "استرداد بعد نزاع", balance_after: nb });
      }
    }
    await supabase.from("disputes").update({
      status: "resolved", winner_id: winnerId, resolved_by: user!.id, resolved_at: new Date().toISOString(),
      resolution: winnerId ? "منح الجائزة للفائز" : "استرداد للطرفين",
    }).eq("id", d.id);
    await supabase.from("challenges").update({ status: "completed" }).eq("id", ch.id);
    await supabase.from("audit_logs").insert({ actor_id: user!.id, action: "dispute_resolved", entity: "disputes", entity_id: d.id, meta: { winner_id: winnerId } });
    toast.success("تم حل النزاع");
    qc.invalidateQueries({ queryKey: ["admin-disputes"] });
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-6">النزاعات</h1>
      <div className="space-y-3">
        {list.data?.length === 0 && <div className="card-elevated p-8 text-center text-muted-foreground">لا توجد نزاعات</div>}
        {list.data?.map((d: any) => (
          <div key={d.id} className="card-elevated p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{d.challenges?.title ?? "تحدي"} — {d.challenges?.games?.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === "open" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>{d.status}</span>
            </div>
            <p className="text-sm text-muted-foreground">السبب: {d.reason ?? "-"}</p>
            <div className="mt-2 text-xs text-muted-foreground">الجائزة: {formatCurrency(d.challenges?.prize ?? 0)} — فتح: {formatDate(d.created_at)}</div>
            {d.status === "open" && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => resolve(d, d.challenges.creator_id)}>الفائز: المُنشئ</Button>
                <Button size="sm" onClick={() => resolve(d, d.challenges.opponent_id)}>الفائز: الخصم</Button>
                <Button size="sm" variant="outline" onClick={() => resolve(d, null)}>استرداد للطرفين</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
