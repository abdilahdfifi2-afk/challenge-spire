import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { Check, X, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/deposits")({
  component: DepositsAdmin,
});

function DepositsAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [proof, setProof] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["admin-deposits", filter],
    queryFn: async () => {
      let q = supabase.from("deposits").select("*, profiles!deposits_user_id_fkey(username, display_name), banks(name)").order("created_at", { ascending: false });
      if (filter !== "all") q = q.eq("status", filter);
      const { data } = await q;
      return data ?? [];
    },
  });

  const viewProof = async (path: string) => {
    const { data } = await supabase.storage.from("proofs").createSignedUrl(path, 300);
    if (data?.signedUrl) setProof(data.signedUrl);
  };

  const decide = async (d: any, status: "approved" | "rejected") => {
    const note = window.prompt(status === "rejected" ? "سبب الرفض:" : "ملاحظة (اختياري):") ?? "";
    if (status === "rejected" && !note) { toast.error("يجب ذكر سبب الرفض"); return; }

    const { error } = await supabase.from("deposits").update({
      status, admin_note: note, processed_by: user!.id, processed_at: new Date().toISOString(),
    }).eq("id", d.id).eq("status", "pending");
    if (error) { toast.error(error.message); return; }

    if (status === "approved") {
      // credit wallet
      const { data: w } = await supabase.from("wallets").select("balance").eq("user_id", d.user_id).maybeSingle();
      const newBal = Number(w?.balance ?? 0) + Number(d.amount);
      await supabase.from("wallets").update({ balance: newBal }).eq("user_id", d.user_id);
      await supabase.from("wallet_transactions").insert({
        user_id: d.user_id, type: "deposit", amount: d.amount, status: "completed",
        reference_id: d.id, description: `إيداع مقبول (${d.id.slice(0, 8)})`, balance_after: newBal,
      });
    }
    await supabase.from("notifications").insert({
      user_id: d.user_id,
      title: status === "approved" ? "تم قبول إيداعك" : "تم رفض إيداعك",
      body: `المبلغ ${formatCurrency(d.amount)} — ${note || ""}`,
      type: status === "approved" ? "success" : "warning",
      link: "/wallet",
    });
    await supabase.from("audit_logs").insert({
      actor_id: user!.id, action: `deposit_${status}`, entity: "deposits", entity_id: d.id, meta: { amount: d.amount },
    });
    toast.success("تم");
    qc.invalidateQueries({ queryKey: ["admin-deposits"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-display text-3xl font-bold">الإيداعات</h1>
        <div className="flex gap-1">
          {(["pending","approved","rejected","all"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
              {f === "pending" ? "معلّق" : f === "approved" ? "مقبول" : f === "rejected" ? "مرفوض" : "الكل"}
            </Button>
          ))}
        </div>
      </div>

      <div className="card-elevated overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/30"><tr className="text-right">
            <th className="p-3">المستخدم</th><th className="p-3">البنك</th><th className="p-3">المبلغ</th><th className="p-3">الحالة</th><th className="p-3">التاريخ</th><th className="p-3">إجراءات</th>
          </tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد طلبات</td></tr>}
            {list.data?.map((d: any) => (
              <tr key={d.id} className="border-t border-border">
                <td className="p-3">{d.profiles?.display_name ?? d.profiles?.username}</td>
                <td className="p-3">{d.banks?.name}</td>
                <td className="p-3 font-semibold">{formatCurrency(d.amount, d.currency)}</td>
                <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{d.status}</span></td>
                <td className="p-3 text-xs text-muted-foreground">{formatDate(d.created_at)}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => viewProof(d.proof_url)}><Eye className="h-4 w-4" /></Button>
                    {d.status === "pending" && <>
                      <Button size="icon" variant="ghost" className="text-success" onClick={() => decide(d, "approved")}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => decide(d, "rejected")}><X className="h-4 w-4" /></Button>
                    </>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!proof} onOpenChange={(v) => !v && setProof(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>صورة الإثبات</DialogTitle></DialogHeader>
          {proof && <img src={proof} alt="proof" className="w-full rounded-md" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
