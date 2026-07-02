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
import { Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/tournaments")({
  component: TournamentsAdmin,
});

function TournamentsAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const games = useQuery({ queryKey: ["games-all"], queryFn: async () => (await supabase.from("games").select("id,name")).data ?? [] });
  const list = useQuery({ queryKey: ["admin-trns"], queryFn: async () => (await supabase.from("tournaments").select("*, games(name)").order("created_at", { ascending: false })).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: any = {
      game_id: String(fd.get("game_id")),
      title: String(fd.get("title")),
      description: String(fd.get("description") || "") || null,
      entry_fee: parseFloat(String(fd.get("entry_fee") || "0")),
      prize_pool: parseFloat(String(fd.get("prize_pool") || "0")),
      max_players: parseInt(String(fd.get("max_players") || "16")),
      status: String(fd.get("status")),
      starts_at: String(fd.get("starts_at") || "") || null,
      ends_at: String(fd.get("ends_at") || "") || null,
    };
    if (!editing) payload.created_by = user!.id;
    const q = editing?.id ? supabase.from("tournaments").update(payload).eq("id", editing.id) : supabase.from("tournaments").insert(payload);
    const { error } = await q;
    if (error) toast.error(error.message);
    else { toast.success("تم"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-trns"] }); }
  };
  const remove = async (id: string) => {
    if (!confirm("حذف البطولة؟")) return;
    const { error } = await supabase.from("tournaments").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["admin-trns"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-bold">البطولات</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground border-0 gap-2" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> إضافة</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "تعديل بطولة" : "بطولة جديدة"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div><Label>اللعبة</Label>
                <select name="game_id" required defaultValue={editing?.game_id ?? ""} className="w-full h-10 rounded-md border border-input bg-transparent px-3">
                  <option value="">اختر</option>
                  {games.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div><Label>العنوان</Label><Input name="title" required defaultValue={editing?.title} /></div>
              <div><Label>الوصف</Label><Textarea name="description" defaultValue={editing?.description ?? ""} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>الرسوم</Label><Input name="entry_fee" type="number" step="0.01" defaultValue={editing?.entry_fee ?? 0} /></div>
                <div><Label>الجائزة</Label><Input name="prize_pool" type="number" step="0.01" defaultValue={editing?.prize_pool ?? 0} /></div>
                <div><Label>عدد اللاعبين</Label><Input name="max_players" type="number" defaultValue={editing?.max_players ?? 16} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>البداية</Label><Input name="starts_at" type="datetime-local" defaultValue={editing?.starts_at?.slice(0,16) ?? ""} /></div>
                <div><Label>النهاية</Label><Input name="ends_at" type="datetime-local" defaultValue={editing?.ends_at?.slice(0,16) ?? ""} /></div>
              </div>
              <div><Label>الحالة</Label>
                <select name="status" defaultValue={editing?.status ?? "draft"} className="w-full h-10 rounded-md border border-input bg-transparent px-3">
                  {["draft","open","in_progress","completed","cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <Button type="submit" className="w-full">حفظ</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="card-elevated overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/30"><tr className="text-right"><th className="p-3">العنوان</th><th className="p-3">اللعبة</th><th className="p-3">الجائزة</th><th className="p-3">الحالة</th><th className="p-3">البداية</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">لا توجد بطولات</td></tr>}
            {list.data?.map((t: any) => (
              <tr key={t.id} className="border-t border-border">
                <td className="p-3 font-medium">{t.title}</td>
                <td className="p-3">{t.games?.name}</td>
                <td className="p-3 font-bold text-gradient-primary">{formatCurrency(t.prize_pool)}</td>
                <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{t.status}</span></td>
                <td className="p-3 text-xs text-muted-foreground">{formatDate(t.starts_at)}</td>
                <td className="p-3 text-end">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
