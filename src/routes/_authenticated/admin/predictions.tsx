import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/predictions")({
  component: PredictionsAdmin,
});

function PredictionsAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-preds"], queryFn: async () => (await supabase.from("predictions").select("*").order("created_at", { ascending: false })).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const opts = String(fd.get("options") || "").split(",").map(s => s.trim()).filter(Boolean);
    const payload: any = {
      title: String(fd.get("title")),
      description: String(fd.get("description") || "") || null,
      options: opts,
      entry_fee: parseFloat(String(fd.get("entry_fee") || "0")),
      prize_pool: parseFloat(String(fd.get("prize_pool") || "0")),
      closes_at: String(fd.get("closes_at") || "") || null,
      status: String(fd.get("status") || "open"),
    };
    if (!editing) payload.created_by = user!.id;
    const q = editing?.id ? supabase.from("predictions").update(payload).eq("id", editing.id) : supabase.from("predictions").insert(payload);
    const { error } = await q;
    if (error) toast.error(error.message);
    else { toast.success("تم"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-preds"] }); }
  };
  const remove = async (id: string) => {
    if (!confirm("حذف؟")) return;
    const { error } = await supabase.from("predictions").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["admin-preds"] });
  };
  const settle = async (p: any) => {
    const answer = window.prompt(`الإجابة الصحيحة (${(p.options as string[]).join(" / ")}):`);
    if (!answer) return;
    // Fetch entries and settle
    const { data: entries } = await supabase.from("prediction_entries").select("*").eq("prediction_id", p.id);
    const winners = (entries ?? []).filter((e) => e.chosen_option === answer);
    const share = winners.length > 0 ? Number(p.prize_pool) / winners.length : 0;
    for (const w of winners) {
      const { data: wl } = await supabase.from("wallets").select("balance").eq("user_id", w.user_id).maybeSingle();
      const nb = Number(wl?.balance ?? 0) + share;
      await supabase.from("wallets").update({ balance: nb }).eq("user_id", w.user_id);
      await supabase.from("wallet_transactions").insert({ user_id: w.user_id, type: "prediction_win", amount: share, status: "completed", reference_id: p.id, description: `ربح توقع: ${p.title}`, balance_after: nb });
      await supabase.from("prediction_entries").update({ is_winner: true, payout: share }).eq("id", w.id);
      await supabase.from("notifications").insert({ user_id: w.user_id, title: "فزت بتوقع!", body: `${p.title} — ${formatCurrency(share)}`, type: "success", link: "/wallet" });
    }
    for (const l of (entries ?? []).filter((e) => e.chosen_option !== answer)) {
      await supabase.from("prediction_entries").update({ is_winner: false, payout: 0 }).eq("id", l.id);
    }
    await supabase.from("predictions").update({ status: "settled", correct_option: answer }).eq("id", p.id);
    await supabase.from("audit_logs").insert({ actor_id: user!.id, action: "prediction_settled", entity: "predictions", entity_id: p.id, meta: { winners: winners.length, share } });
    toast.success(`تسوية: ${winners.length} فائز`);
    qc.invalidateQueries({ queryKey: ["admin-preds"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-bold">التوقعات</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground border-0 gap-2" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> إضافة</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "تعديل" : "توقع جديد"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div><Label>العنوان</Label><Input name="title" required defaultValue={editing?.title} /></div>
              <div><Label>الوصف</Label><Textarea name="description" defaultValue={editing?.description ?? ""} /></div>
              <div><Label>الخيارات (مفصولة بفواصل)</Label><Input name="options" required placeholder="مثال: فريق أ, فريق ب, تعادل" defaultValue={(editing?.options ?? []).join(", ")} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الرسوم</Label><Input name="entry_fee" type="number" step="0.01" defaultValue={editing?.entry_fee ?? 0} /></div>
                <div><Label>الجائزة</Label><Input name="prize_pool" type="number" step="0.01" defaultValue={editing?.prize_pool ?? 0} /></div>
              </div>
              <div><Label>ينتهي في</Label><Input name="closes_at" type="datetime-local" defaultValue={editing?.closes_at?.slice(0,16) ?? ""} /></div>
              <div><Label>الحالة</Label>
                <select name="status" defaultValue={editing?.status ?? "open"} className="w-full h-10 rounded-md border border-input bg-transparent px-3">
                  {["open","closed","settled","cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Button type="submit" className="w-full">حفظ</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="card-elevated overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/30"><tr className="text-right"><th className="p-3">العنوان</th><th className="p-3">الخيارات</th><th className="p-3">الجائزة</th><th className="p-3">الحالة</th><th className="p-3">ينتهي</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list.data?.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="p-3 font-medium">{p.title}</td>
                <td className="p-3 text-xs">{(p.options as string[]).join(" / ")}</td>
                <td className="p-3 font-bold text-gradient-primary">{formatCurrency(p.prize_pool)}</td>
                <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{p.status}</span></td>
                <td className="p-3 text-xs text-muted-foreground">{formatDate(p.closes_at)}</td>
                <td className="p-3 text-end">
                  {p.status !== "settled" && (
                    <Button variant="ghost" size="icon" title="تسوية" onClick={() => settle(p)}><CheckCircle2 className="h-4 w-4 text-success" /></Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
