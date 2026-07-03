import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { translateFinancialError } from "@/lib/rpc-errors";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  component: WithdrawalsAdmin,
});

function WithdrawalsAdmin() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all"|"pending"|"approved"|"rejected">("pending");
  const list = useQuery({
    queryKey: ["admin-wds", filter],
    queryFn: async () => {
      let q = supabase.from("withdrawals").select("*").order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data, error } = await q;
      if (error) throw error;
      const items = data ?? [];
      const ids = [...new Set(items.map((i: any) => i.user_id))];
      if (ids.length === 0) return items;
      const { data: profs } = await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", ids);
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return items.map((i: any) => ({ ...i, profiles: map.get(i.user_id) }));
    },
    refetchInterval: 15000,
  });

  const decide = async (w: any, action: "approve"|"reject") => {
    if (action === "reject") {
      const note = window.prompt("سبب الرفض:") ?? "";
      if (!note.trim()) { toast.error("سبب الرفض مطلوب"); return; }
      const { error } = await supabase.rpc("admin_reject_withdrawal", { _wd_id: w.id, _note: note });
      if (error) { toast.error(translateFinancialError(error.message)); return; }
    } else {
      const { error } = await supabase.rpc("admin_approve_withdrawal", { _wd_id: w.id });
      if (error) { toast.error(translateFinancialError(error.message)); return; }
    }
    toast.success("تم تنفيذ العملية");
    qc.invalidateQueries({ queryKey: ["admin-wds"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-display text-3xl font-bold">السحوبات</h1>
        <div className="flex gap-1">
          {(["pending","approved","rejected","all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "pending" ? "معلّق" : f === "approved" ? "مقبول" : f === "rejected" ? "مرفوض" : "الكل"}
            </Button>
          ))}
        </div>
      </div>
      <div className="card-elevated overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-muted/30"><tr className="text-right">
            <th className="p-3">المستخدم</th><th className="p-3">الوسيلة</th><th className="p-3">صاحب الحساب</th><th className="p-3">رقم الحساب</th><th className="p-3">المبلغ</th><th className="p-3">الحالة</th><th className="p-3">التاريخ</th><th className="p-3">إجراءات</th>
          </tr></thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">جاري التحميل…</td></tr>}
            {!list.isLoading && list.data?.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد طلبات</td></tr>}
            {list.data?.map((w: any) => (
              <tr key={w.id} className="border-t border-border">
                <td className="p-3">{w.profiles?.display_name ?? w.profiles?.username}</td>
                <td className="p-3">{w.method}</td>
                <td className="p-3">{w.account_holder}</td>
                <td className="p-3 font-mono text-xs">{w.account_number}</td>
                <td className="p-3 font-semibold">{formatCurrency(w.amount, w.currency)}</td>
                <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{w.status}</span></td>
                <td className="p-3 text-xs text-muted-foreground">{formatDate(w.created_at)}</td>
                <td className="p-3">
                  {w.status === "pending" && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" aria-label="قبول" className="text-success" onClick={() => decide(w, "approve")}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label="رفض" className="text-destructive" onClick={() => decide(w, "reject")}><X className="h-4 w-4" /></Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
