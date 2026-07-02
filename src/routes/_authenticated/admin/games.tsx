import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/games")({
  component: GamesAdmin,
});

function GamesAdmin() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["admin-games"], queryFn: async () => (await supabase.from("games").select("*").order("name")).data ?? [] });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name")),
      slug: String(fd.get("slug")),
      description: String(fd.get("description") || "") || null,
      image_url: String(fd.get("image_url") || "") || null,
      is_active: fd.get("is_active") === "on",
    };
    const q = editing?.id ? supabase.from("games").update(payload).eq("id", editing.id) : supabase.from("games").insert(payload);
    const { error } = await q;
    if (error) toast.error(error.message);
    else { toast.success("تم"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-games"] }); }
  };
  const remove = async (id: string) => {
    if (!confirm("حذف؟")) return;
    const { error } = await supabase.from("games").delete().eq("id", id);
    if (error) toast.error(error.message); else qc.invalidateQueries({ queryKey: ["admin-games"] });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-bold">الألعاب</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button className="gradient-primary text-primary-foreground border-0 gap-2" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> إضافة</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "تعديل" : "لعبة جديدة"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div><Label>الاسم</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div><Label>Slug</Label><Input name="slug" required defaultValue={editing?.slug} /></div>
              <div><Label>الوصف</Label><Textarea name="description" defaultValue={editing?.description ?? ""} /></div>
              <div><Label>رابط الصورة</Label><Input name="image_url" defaultValue={editing?.image_url ?? ""} /></div>
              <div className="flex items-center gap-2"><Switch name="is_active" defaultChecked={editing?.is_active ?? true} /><Label>نشط</Label></div>
              <Button type="submit" className="w-full">حفظ</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <div className="card-elevated overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30"><tr className="text-right"><th className="p-3">الاسم</th><th className="p-3">Slug</th><th className="p-3">الحالة</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list.data?.map((g) => (
              <tr key={g.id} className="border-t border-border">
                <td className="p-3 font-medium">{g.name}</td>
                <td className="p-3 text-xs text-muted-foreground">{g.slug}</td>
                <td className="p-3"><span className={`text-xs px-2 py-0.5 rounded-full ${g.is_active ? "bg-success/15 text-success" : "bg-muted"}`}>{g.is_active ? "نشط" : "معطل"}</span></td>
                <td className="p-3 text-end">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(g); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(g.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
