import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { ArrowDownCircle, ArrowUpCircle, Wallet as WalletIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/wallet/")({
  head: () => ({ meta: [{ title: "المحفظة — ArenaX" }] }),
  component: WalletPage,
});

function WalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const wallet = useQuery({
    queryKey: ["wallet", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("wallets").select("*").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const txs = useQuery({
    queryKey: ["wallet-txs", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("wallet_transactions")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`wallet-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wallets", filter: `user_id=eq.${user.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["wallet", user.id] });
        qc.invalidateQueries({ queryKey: ["wallet-txs", user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, qc]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="card-elevated p-8 gradient-hero">
        <div className="flex items-center gap-3 text-muted-foreground">
          <WalletIcon className="h-5 w-5" /> رصيدك الحالي
        </div>
        <div className="mt-2 text-5xl font-display font-bold text-gradient-primary">
          {formatCurrency(wallet.data?.balance ?? 0, wallet.data?.currency ?? "MAD")}
        </div>
        {wallet.data && Number(wallet.data.locked_balance) > 0 && (
          <div className="mt-2 text-xs text-warning">مبلغ محجوز: {formatCurrency(wallet.data.locked_balance)}</div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/wallet/deposit">
            <Button className="gradient-primary text-primary-foreground border-0 glow-primary gap-2">
              <ArrowDownCircle className="h-4 w-4" /> إيداع
            </Button>
          </Link>
          <Link to="/wallet/withdraw">
            <Button variant="outline" className="gap-2 border-accent/50 text-accent">
              <ArrowUpCircle className="h-4 w-4" /> سحب
            </Button>
          </Link>
        </div>
      </div>

      <h2 className="font-display text-xl font-bold mt-10 mb-4">سجل العمليات</h2>
      <div className="card-elevated overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr className="text-right">
              <th className="p-3 font-medium">النوع</th>
              <th className="p-3 font-medium">المبلغ</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium">الوصف</th>
              <th className="p-3 font-medium">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {(txs.data ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">لا توجد عمليات</td></tr>
            )}
            {txs.data?.map((t) => {
              const isCredit = ["deposit","challenge_win","tournament_prize","prediction_win","refund"].includes(t.type as any);
              return (
                <tr key={t.id} className="border-t border-border">
                  <td className="p-3">{typeLabel(t.type)}</td>
                  <td className={`p-3 font-semibold ${isCredit ? "text-success" : "text-destructive"}`}>
                    {isCredit ? "+" : "-"}{formatCurrency(Math.abs(Number(t.amount)))}
                  </td>
                  <td className="p-3"><span className="text-xs px-2 py-0.5 rounded-full bg-muted">{t.status}</span></td>
                  <td className="p-3 text-muted-foreground text-xs">{t.description ?? "-"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDate(t.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function typeLabel(t: string) {
  const map: Record<string, string> = {
    deposit: "إيداع", withdrawal: "سحب",
    challenge_entry: "رسوم تحدي", challenge_win: "ربح تحدي",
    tournament_entry: "رسوم بطولة", tournament_prize: "جائزة بطولة",
    prediction_entry: "رسوم توقع", prediction_win: "ربح توقع",
    refund: "استرداد", adjustment: "تسوية",
  };
  return map[t] ?? t;
}
