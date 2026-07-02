import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { translateFinancialError } from "@/lib/rpc-errors";

export const Route = createFileRoute("/_authenticated/wallet/withdraw")({
  head: () => ({ meta: [{ title: "سحب — ArenaX" }] }),
  component: WithdrawPage,
});

function WithdrawPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [method, setMethod] = useState("bank_transfer");
  const [holder, setHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const wallet = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const settings = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => (await supabase.from("platform_settings").select("*").maybeSingle()).data,
  });

  const available = Number(wallet.data?.balance ?? 0) - Number(wallet.data?.locked_balance ?? 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("مبلغ غير صالح"); return; }
    setLoading(true);
    const { error } = await supabase.rpc("create_withdrawal", {
      _method: method,
      _account_holder: holder,
      _bank_name: bankName,
      _account_number: account,
      _amount: amt,
    });
    setLoading(false);
    if (error) { toast.error(translateFinancialError(error.message)); return; }
    toast.success("تم إرسال طلب السحب — حُجز المبلغ حتى المعالجة");
    nav({ to: "/wallet" });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-2">سحب</h1>
      <p className="text-sm text-muted-foreground mb-1">
        الرصيد الإجمالي: <span className="font-semibold">{formatCurrency(wallet.data?.balance ?? 0)}</span>
      </p>
      <p className="text-sm text-muted-foreground mb-6">
        المتاح للسحب: <span className="font-bold text-gradient-primary">{formatCurrency(available)}</span>
        {Number(wallet.data?.locked_balance ?? 0) > 0 && (
          <span className="text-warning ms-2">({formatCurrency(wallet.data?.locked_balance ?? 0)} محجوز)</span>
        )}
      </p>
      {settings.data && (
        <p className="text-xs text-muted-foreground mb-4">
          الحد الأدنى: {formatCurrency(settings.data.min_withdrawal)} — الحد الأقصى: {formatCurrency(settings.data.max_withdrawal)}
        </p>
      )}

      <form onSubmit={submit} className="card-elevated p-6 space-y-5">
        <div>
          <Label>وسيلة السحب</Label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full h-10 rounded-md border border-input bg-transparent px-3">
            <option value="bank_transfer">تحويل بنكي</option>
            <option value="wallet">محفظة إلكترونية</option>
            <option value="cash">استلام نقدي</option>
          </select>
        </div>
        <div><Label>اسم صاحب الحساب</Label><Input required value={holder} onChange={(e) => setHolder(e.target.value)} /></div>
        {method === "bank_transfer" && (
          <div><Label>اسم البنك</Label><Input required value={bankName} onChange={(e) => setBankName(e.target.value)} /></div>
        )}
        <div><Label>رقم الحساب / IBAN / المحفظة</Label><Input required value={account} onChange={(e) => setAccount(e.target.value)} /></div>
        <div><Label>المبلغ</Label><Input type="number" step="0.01" min="1" required value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <Button disabled={loading} className="w-full gradient-primary text-primary-foreground border-0">
          {loading ? "جاري الإرسال..." : "إرسال طلب السحب"}
        </Button>
      </form>
    </div>
  );
}
