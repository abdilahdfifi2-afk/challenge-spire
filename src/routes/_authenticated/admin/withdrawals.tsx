import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  component: WithdrawalsAdmin,
});

function WithdrawalsAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all"|"pending"|"approved"|"rejected">("pending");
  const list = useQuery({
    queryKey: ["admin-wds", filter],
    queryFn: async () => {
      let q = supabase.from("withdrawals").select("*, profiles!withdrawals_user_id_fkey(username, display_name)").order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      return (await q).data ?? [];
    },
  });

  const decide = async (w: any, status: "approved"|"rejected") => {
    const note = window.prompt(status === "rejected" ? "سبب الرفض:" : "ملاحظة (اختياري):") ?? "";
    if (status === "rejected" && !note) { toast.error("سبب الرفض مطلوب"); return; }
    const { error } = await supabase.from("withdrawals").update({
      status, admin_note: note, processed_by: user!.id, processed_at: new Date().toISOString(),
    }).eq("id", w.id).eq("status", "pending");
    if (error) { toast.error(error.message); return; }
    if (status === "approved") {
      const { data: wl } = await supabase.from("wallets").select("balance").eq("user_id", w.user_id).maybeSingle();
      const cur = Number(wl?.balance ?? 0);
      if (cur < Number(w.amount)) { toast.error("رصيد المستخدم لا يكفي"); return; }
      const newBal = cur - Number(w.amount);
      await supabase.from("wallets").update({ balance: newBal }).eq("user_id", w.user_id);
      await supabase.from("wallet_transactions").insert({
        user_id: w.user_id, type: "withdrawal", amount: w.amount, status: "completed",
        reference_id: w.id, description: `سحب مقبول (${w.id.slice(0,8)})`, balance_after: newBal,
      });
    }
    await supabase.from("notifications").insert({
      user_id: w.user_id,
      title: status === "approved" ? "تم قبول طلب السحب" : "تم رفض طلب السحب",
      body: `المبلغ ${formatCurrency(w.amount)} — ${note || ""}`,
      type: status === "approved" ? "success" : "warning",
      link: "/wallet",
    });
    await supabase.from("audit_logs").insert({ actor_id: user!.id, action: `withdrawal_${status}`, entity: "withdrawals", entity_id: w.id, meta: { amount: w.amount } });
    toast.success("تم");
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
            {list.data?.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">لا توجد طلبات</td></tr>}
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
                      <Button size="icon" variant="ghost" className="text-success" onClick={() => decide(w, "approved")}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => decide(w, "rejected")}><X className="h-4 w-4" /></Button>
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
