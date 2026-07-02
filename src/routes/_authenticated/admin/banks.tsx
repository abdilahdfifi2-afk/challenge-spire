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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/banks")({
  component: BanksAdmin,
});

function BanksAdmin() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin-banks"],
    queryFn: async () => (await supabase.from("banks").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const [editing, setEditing] = useState<any>(null);
  const [open, setOpen] = useState(false);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name")),
      logo_url: String(fd.get("logo_url") || "") || null,
      account_name: String(fd.get("account_name")),
      account_number: String(fd.get("account_number")),
      iban: String(fd.get("iban") || "") || null,
      swift: String(fd.get("swift") || "") || null,
      country: String(fd.get("country") || "") || null,
      currency: String(fd.get("currency") || "MAD"),
      instructions: String(fd.get("instructions") || "") || null,
      is_active: fd.get("is_active") === "on",
    };
    const q = editing?.id ? supabase.from("banks").update(payload).eq("id", editing.id) : supabase.from("banks").insert(payload);
    const { error } = await q;
    if (error) toast.error(error.message);
    else { toast.success("تم الحفظ"); setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["admin-banks"] }); }
  };

  const toggle = async (b: any) => {
    await supabase.from("banks").update({ is_active: !b.is_active }).eq("id", b.id);
    qc.invalidateQueries({ queryKey: ["admin-banks"] });
  };
  const remove = async (id: string) => {
    const { error } = await supabase.from("banks").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("تم الحذف"); qc.invalidateQueries({ queryKey: ["admin-banks"] }); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-bold">البنوك</h1>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="gradient-primary text-primary-foreground border-0 gap-2" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4" /> إضافة بنك
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "تعديل بنك" : "بنك جديد"}</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div><Label>الاسم</Label><Input name="name" required defaultValue={editing?.name} /></div>
              <div><Label>رابط الشعار</Label><Input name="logo_url" defaultValue={editing?.logo_url ?? ""} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>اسم الحساب</Label><Input name="account_name" required defaultValue={editing?.account_name} /></div>
                <div><Label>رقم الحساب</Label><Input name="account_number" required defaultValue={editing?.account_number} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>IBAN</Label><Input name="iban" defaultValue={editing?.iban ?? ""} /></div>
                <div><Label>SWIFT</Label><Input name="swift" defaultValue={editing?.swift ?? ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الدولة</Label><Input name="country" defaultValue={editing?.country ?? ""} /></div>
                <div><Label>العملة</Label><Input name="currency" defaultValue={editing?.currency ?? "MAD"} /></div>
              </div>
              <div><Label>تعليمات</Label><Textarea name="instructions" rows={2} defaultValue={editing?.instructions ?? ""} /></div>
              <div className="flex items-center gap-2">
                <Switch name="is_active" defaultChecked={editing?.is_active ?? true} /> <Label>نشط</Label>
              </div>
              <Button type="submit" className="w-full">حفظ</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="card-elevated overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30"><tr className="text-right">
            <th className="p-3">البنك</th><th className="p-3">الحساب</th><th className="p-3">العملة</th><th className="p-3">الحالة</th><th className="p-3"></th>
          </tr></thead>
          <tbody>
            {list.data?.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">لا توجد بنوك بعد</td></tr>}
            {list.data?.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="p-3 font-medium">{b.name}</td>
                <td className="p-3 text-xs"><div>{b.account_name}</div><div className="font-mono text-muted-foreground">{b.account_number}</div></td>
                <td className="p-3">{b.currency}</td>
                <td className="p-3"><Switch checked={b.is_active} onCheckedChange={() => toggle(b)} /></td>
                <td className="p-3 text-end">
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(b); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="icon"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>حذف هذا البنك؟</AlertDialogTitle>
                        <AlertDialogDescription>لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={() => remove(b.id)}>حذف</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
