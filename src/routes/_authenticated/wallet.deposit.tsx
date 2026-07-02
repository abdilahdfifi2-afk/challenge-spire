import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/wallet/deposit")({
  head: () => ({ meta: [{ title: "إيداع — ArenaX" }] }),
  component: DepositPage,
});

function DepositPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [bankId, setBankId] = useState("");
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const banks = useQuery({
    queryKey: ["banks-active"],
    queryFn: async () => {
      const { data } = await supabase.from("banks").select("*").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const chosen = banks.data?.find((b) => b.id === bankId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !file || !bankId || !amount) { toast.error("أكمل جميع الحقول"); return; }
    setLoading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const up = await supabase.storage.from("proofs").upload(path, file);
      if (up.error) throw up.error;
      const { error } = await supabase.from("deposits").insert({
        user_id: user.id,
        bank_id: bankId,
        amount: parseFloat(amount),
        currency: chosen?.currency ?? "MAD",
        proof_url: path,
      });
      if (error) throw error;
      toast.success("تم إرسال طلب الإيداع للمراجعة");
      nav({ to: "/wallet" });
    } catch (err: any) {
      toast.error(err.message ?? "خطأ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-2">إيداع</h1>
      <p className="text-sm text-muted-foreground mb-6">اختر بنكاً، أرسل التحويل، ثم ارفع صورة الإثبات.</p>

      <form onSubmit={submit} className="card-elevated p-6 space-y-5">
        <div>
          <Label>البنك</Label>
          <Select value={bankId} onValueChange={setBankId}>
            <SelectTrigger><SelectValue placeholder="اختر بنكاً" /></SelectTrigger>
            <SelectContent>
              {banks.data?.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name} — {b.currency}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {banks.data?.length === 0 && (
            <p className="text-xs text-warning mt-2">لم يقم الأدمن بإضافة أي بنك بعد.</p>
          )}
        </div>

        {chosen && (
          <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1">
            <div><span className="text-muted-foreground">اسم الحساب:</span> <span className="font-medium">{chosen.account_name}</span></div>
            <div><span className="text-muted-foreground">رقم الحساب:</span> <span className="font-mono">{chosen.account_number}</span></div>
            {chosen.iban && <div><span className="text-muted-foreground">IBAN:</span> <span className="font-mono">{chosen.iban}</span></div>}
            {chosen.swift && <div><span className="text-muted-foreground">SWIFT:</span> <span className="font-mono">{chosen.swift}</span></div>}
            {chosen.instructions && <div className="text-xs text-muted-foreground mt-2">{chosen.instructions}</div>}
          </div>
        )}

        <div>
          <Label>المبلغ ({chosen?.currency ?? "MAD"})</Label>
          <Input type="number" step="0.01" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} />
          {amount && <p className="text-xs text-muted-foreground mt-1">= {formatCurrency(parseFloat(amount) || 0, chosen?.currency ?? "MAD")}</p>}
        </div>

        <div>
          <Label>صورة الإثبات</Label>
          <Input type="file" accept="image/*" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>

        <Button disabled={loading} className="w-full gradient-primary text-primary-foreground border-0">
          {loading ? "جاري الإرسال..." : "إرسال الطلب"}
        </Button>
      </form>
    </div>
  );
}
