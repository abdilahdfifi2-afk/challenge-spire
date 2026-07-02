import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: SettingsAdmin,
});

function SettingsAdmin() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => (await supabase.from("platform_settings").select("*").maybeSingle()).data,
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (q.data && !form) setForm(q.data); }, [q.data, form]);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const { error } = await supabase.from("platform_settings").update({
      commission_pct: Number(form.commission_pct),
      min_deposit: Number(form.min_deposit),
      max_deposit: Number(form.max_deposit),
      min_withdrawal: Number(form.min_withdrawal),
      max_withdrawal: Number(form.max_withdrawal),
      min_challenge_fee: Number(form.min_challenge_fee),
      max_challenge_fee: Number(form.max_challenge_fee),
    }).eq("id", true);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
    qc.invalidateQueries({ queryKey: ["platform-settings"] });
  };

  if (q.isLoading || !form) return <div className="text-muted-foreground">جاري التحميل…</div>;

  const field = (key: string, label: string, step = "0.01") => (
    <div>
      <Label>{label}</Label>
      <Input type="number" step={step} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-2">إعدادات المنصة</h1>
      <p className="text-sm text-muted-foreground mb-6">هذه القيم تُطبَّق فوراً على كل عمليات التحديات والمحفظة.</p>
      <form onSubmit={save} className="card-elevated p-6 space-y-4 max-w-2xl">
        <div className="grid md:grid-cols-2 gap-4">
          {field("commission_pct", "نسبة عمولة المنصة (%)", "0.01")}
        </div>
        <div className="border-t border-border pt-4">
          <h2 className="font-semibold mb-3">حدود الإيداع</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {field("min_deposit", "الحد الأدنى للإيداع (MAD)")}
            {field("max_deposit", "الحد الأقصى للإيداع (MAD)")}
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <h2 className="font-semibold mb-3">حدود السحب</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {field("min_withdrawal", "الحد الأدنى للسحب (MAD)")}
            {field("max_withdrawal", "الحد الأقصى للسحب (MAD)")}
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <h2 className="font-semibold mb-3">حدود رسوم التحديات</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {field("min_challenge_fee", "الحد الأدنى للرسوم (MAD)")}
            {field("max_challenge_fee", "الحد الأقصى للرسوم (MAD)")}
          </div>
        </div>
        <Button disabled={saving} className="w-full gradient-primary text-primary-foreground border-0">
          {saving ? "جاري الحفظ…" : "حفظ الإعدادات"}
        </Button>
      </form>
    </div>
  );
}
