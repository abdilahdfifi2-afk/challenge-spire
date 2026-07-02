import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { Search, ShieldCheck, ShieldOff } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: UsersAdmin,
});

function UsersAdmin() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["admin-users", q],
    queryFn: async () => {
      let query = supabase.from("profiles").select("*, user_roles(role), wallets(balance, currency)").order("created_at", { ascending: false }).limit(100);
      if (q) query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%`);
      return (await query).data ?? [];
    },
  });

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    if (isAdmin) {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    } else {
      await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    }
    toast.success("تم");
    qc.invalidateQueries({ queryKey: ["admin-users"] });
  };

  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-6">المستخدمون</h1>
      <div className="mb-4 relative max-w-sm">
        <Search className="h-4 w-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
        <Input className="ps-9" placeholder="ابحث باسم المستخدم..." value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card-elevated overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/30"><tr className="text-right"><th className="p-3">المستخدم</th><th className="p-3">الرصيد</th><th className="p-3">النقاط</th><th className="p-3">V/L</th><th className="p-3">الأدوار</th><th className="p-3">التاريخ</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list.data?.map((u: any) => {
              const isAdmin = u.user_roles?.some((r: any) => r.role === "admin");
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="font-medium">{u.display_name ?? u.username}</div>
                    <div className="text-xs text-muted-foreground">@{u.username}</div>
                  </td>
                  <td className="p-3">{u.wallets?.[0]?.balance ?? 0} {u.wallets?.[0]?.currency ?? "MAD"}</td>
                  <td className="p-3">{u.rank_points}</td>
                  <td className="p-3 text-xs"><span className="text-success">{u.wins}</span>/<span className="text-destructive">{u.losses}</span></td>
                  <td className="p-3">
                    {isAdmin && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">أدمن</span>}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{formatDate(u.created_at)}</td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => toggleAdmin(u.id, isAdmin)}>
                      {isAdmin ? <><ShieldOff className="h-3 w-3 me-1" /> إزالة أدمن</> : <><ShieldCheck className="h-3 w-3 me-1" /> تعيين أدمن</>}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
