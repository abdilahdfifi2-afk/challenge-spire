import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { translateFinancialError } from "@/lib/rpc-errors";

export const Route = createFileRoute("/_authenticated/admin/disputes")({
  component: DisputesAdmin,
});

function DisputesAdmin() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin-disputes"],
    queryFn: async () =>
      (await supabase
        .from("disputes")
        .select("*, challenges(id, title, prize, entry_fee, creator_id, opponent_id, games(name))")
        .order("created_at", { ascending: false })).data ?? [],
  });

  const resolve = async (d: any, winnerId: string | null, resolution: string) => {
    const { error } = await supabase.rpc("admin_resolve_dispute", {
      _dispute_id: d.id,
      _winner: winnerId as any,
      _resolution: resolution,
    });
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    toast.success("تم حل النزاع");
    qc.invalidateQueries({ queryKey: ["admin-disputes"] });
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-6">النزاعات</h1>
      <div className="space-y-3">
        {list.isLoading && <div className="card-elevated p-8 text-center text-muted-foreground">جاري التحميل…</div>}
        {!list.isLoading && list.data?.length === 0 && <div className="card-elevated p-8 text-center text-muted-foreground">لا توجد نزاعات</div>}
        {list.data?.map((d: any) => (
          <div key={d.id} className="card-elevated p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">{d.challenges?.title ?? "تحدي"} — {d.challenges?.games?.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${d.status === "open" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>{d.status}</span>
            </div>
            <p className="text-sm text-muted-foreground">السبب: {d.reason ?? "-"}</p>
            <div className="mt-2 text-xs text-muted-foreground">الجائزة: {formatCurrency(d.challenges?.prize ?? 0)} — فتح: {formatDate(d.created_at)}</div>
            {d.status === "open" && d.challenges && (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => resolve(d, d.challenges.creator_id, "منح الجائزة للمُنشئ")}>الفائز: المُنشئ</Button>
                {d.challenges.opponent_id && (
                  <Button size="sm" onClick={() => resolve(d, d.challenges.opponent_id, "منح الجائزة للخصم")}>الفائز: الخصم</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => resolve(d, null, "استرداد للطرفين")}>استرداد للطرفين</Button>
              </div>
            )}
            {d.status === "resolved" && d.resolution && (
              <div className="mt-3 text-xs text-muted-foreground">القرار: {d.resolution}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
