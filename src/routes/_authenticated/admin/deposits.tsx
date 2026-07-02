import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { translateFinancialError } from "@/lib/rpc-errors";
import { Check, X, Eye } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/deposits")({
  component: DepositsAdmin,
});

function DepositsAdmin() {
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

  const decide = async (d: any, action: "approve" | "reject") => {
    if (action === "reject") {
      const note = window.prompt("سبب الرفض:") ?? "";
      if (!note.trim()) { toast.error("سبب الرفض مطلوب"); return; }
      const { error } = await supabase.rpc("admin_reject_deposit", { _deposit_id: d.id, _note: note });
      if (error) { toast.error(translateFinancialError(error.message)); return; }
    } else {
      const { error } = await supabase.rpc("admin_approve_deposit", { _deposit_id: d.id });
      if (error) { toast.error(translateFinancialError(error.message)); return; }
    }
    toast.success("تم تنفيذ العملية");
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
            {list.isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">جاري التحميل…</td></tr>}
            {!list.isLoading && list.data?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد طلبات</td></tr>}
            {list.data?.map((d: any) => (
              <tr key={d.id} className="border-t border-border">
                <td className="p-3">{d.profiles?.display_name ?? d.profiles?.username}</td>
                <td className="p-3">{d.banks?.name}</td>
                <td className="p-3 font-semibold">{formatCurrency(d.amount, d.currency)}</td>
                <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{d.status}</span></td>
                <td className="p-3 text-xs text-muted-foreground">{formatDate(d.created_at)}</td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" aria-label="عرض الإثبات" onClick={() => viewProof(d.proof_url)}><Eye className="h-4 w-4" /></Button>
                    {d.status === "pending" && <>
                      <Button size="icon" variant="ghost" aria-label="قبول" className="text-success" onClick={() => decide(d, "approve")}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" aria-label="رفض" className="text-destructive" onClick={() => decide(d, "reject")}><X className="h-4 w-4" /></Button>
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
