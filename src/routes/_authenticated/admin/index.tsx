import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Landmark, ArrowDownCircle, ArrowUpCircle, Trophy, Target, AlertTriangle, Swords } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [users, banks, depPending, wdPending, tournaments, predictions, disputes, challenges] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("banks").select("*", { count: "exact", head: true }),
        supabase.from("deposits").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("withdrawals").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("tournaments").select("*", { count: "exact", head: true }),
        supabase.from("predictions").select("*", { count: "exact", head: true }),
        supabase.from("disputes").select("*", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("challenges").select("*", { count: "exact", head: true }),
      ]);
      return {
        users: users.count ?? 0, banks: banks.count ?? 0,
        depPending: depPending.count ?? 0, wdPending: wdPending.count ?? 0,
        tournaments: tournaments.count ?? 0, predictions: predictions.count ?? 0,
        disputes: disputes.count ?? 0, challenges: challenges.count ?? 0,
      };
    },
  });
  const items = [
    { icon: Users, label: "المستخدمون", value: stats.data?.users, color: "text-primary" },
    { icon: Landmark, label: "البنوك", value: stats.data?.banks, color: "text-accent" },
    { icon: ArrowDownCircle, label: "إيداعات معلّقة", value: stats.data?.depPending, color: "text-warning" },
    { icon: ArrowUpCircle, label: "سحوبات معلّقة", value: stats.data?.wdPending, color: "text-warning" },
    { icon: Swords, label: "التحديات", value: stats.data?.challenges, color: "text-primary" },
    { icon: Trophy, label: "البطولات", value: stats.data?.tournaments, color: "text-accent" },
    { icon: Target, label: "التوقعات", value: stats.data?.predictions, color: "text-accent" },
    { icon: AlertTriangle, label: "نزاعات مفتوحة", value: stats.data?.disputes, color: "text-destructive" },
  ];
  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-6">لوحة القيادة</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((it) => (
          <div key={it.label} className="card-elevated p-5">
            <it.icon className={`h-6 w-6 ${it.color} mb-2`} />
            <div className="text-3xl font-display font-bold">{it.value ?? "-"}</div>
            <div className="text-xs text-muted-foreground mt-1">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
