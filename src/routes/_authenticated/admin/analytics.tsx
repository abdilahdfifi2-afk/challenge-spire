import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, Users, Swords, Trophy, Wallet as WalletIcon, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const q = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const [players, challenges, tournaments, completed, txs, deposits, withdrawals, settings] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("challenges").select("id", { count: "exact", head: true }),
        supabase.from("tournaments").select("id", { count: "exact", head: true }),
        supabase.from("challenges").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("wallet_transactions").select("type, amount").eq("status", "completed"),
        supabase.from("deposits").select("amount, status").eq("status", "approved"),
        supabase.from("withdrawals").select("amount, status").eq("status", "approved"),
        supabase.from("platform_settings").select("commission_pct").eq("id", true).single(),
      ]);

      const wagered = (txs.data ?? [])
        .filter((t) => t.type === "challenge_entry")
        .reduce((a, t) => a + Number(t.amount || 0), 0);
      const commissionPct = Number(settings.data?.commission_pct ?? 10);
      const estRevenue = (wagered * commissionPct) / 100 / 2; // half of loser stakes' commission approximation
      const totalDeposits = (deposits.data ?? []).reduce((a, t) => a + Number(t.amount || 0), 0);
      const totalWithdrawals = (withdrawals.data ?? []).reduce((a, t) => a + Number(t.amount || 0), 0);

      return {
        players: players.count ?? 0,
        challenges: challenges.count ?? 0,
        tournaments: tournaments.count ?? 0,
        completed: completed.count ?? 0,
        wagered,
        estRevenue,
        totalDeposits,
        totalWithdrawals,
        netFlow: totalDeposits - totalWithdrawals,
        commissionPct,
      };
    },
  });

  const d = q.data;

  return (
    <div className="px-4 py-8">
      <h1 className="font-display text-2xl font-bold flex items-center gap-3 mb-6">
        <BarChart3 className="h-6 w-6 text-primary" /> التحليلات
      </h1>

      {!d && <div className="text-muted-foreground">جارٍ التحميل…</div>}
      {d && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Stat icon={Users} label="اللاعبون" value={d.players.toLocaleString("ar")} />
            <Stat icon={Swords} label="التحديات" value={d.challenges.toLocaleString("ar")} />
            <Stat icon={Trophy} label="البطولات" value={d.tournaments.toLocaleString("ar")} />
            <Stat icon={TrendingUp} label="مباريات مكتملة" value={d.completed.toLocaleString("ar")} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Stat icon={WalletIcon} label="إجمالي الرهانات" value={formatCurrency(d.wagered)} highlight />
            <Stat
              icon={TrendingUp}
              label={`عمولة المنصة (~${d.commissionPct}%)`}
              value={formatCurrency(d.estRevenue)}
              highlight
            />
            <Stat icon={WalletIcon} label="إجمالي الإيداعات" value={formatCurrency(d.totalDeposits)} />
            <Stat icon={WalletIcon} label="إجمالي السحوبات" value={formatCurrency(d.totalWithdrawals)} />
            <Stat
              icon={TrendingUp}
              label="التدفق الصافي"
              value={formatCurrency(d.netFlow)}
              highlight={d.netFlow >= 0}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`p-4 rounded-xl border ${
        highlight ? "bg-primary/5 border-primary/40" : "bg-card border-border"
      }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className={`font-display text-2xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
