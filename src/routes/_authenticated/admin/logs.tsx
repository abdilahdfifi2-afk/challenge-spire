import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/logs")({
  component: LogsAdmin,
});

function LogsAdmin() {
  const list = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => (await supabase.from("audit_logs").select("*, profiles!audit_logs_actor_profile_fkey(username)").order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <div>
      <h1 className="font-display text-3xl font-bold mb-6">سجل التدقيق</h1>
      <div className="card-elevated overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-muted/30"><tr className="text-right"><th className="p-3">التاريخ</th><th className="p-3">المستخدم</th><th className="p-3">الإجراء</th><th className="p-3">الكيان</th><th className="p-3">التفاصيل</th></tr></thead>
          <tbody>
            {list.data?.map((l: any) => (
              <tr key={l.id} className="border-t border-border">
                <td className="p-3 text-xs text-muted-foreground">{formatDate(l.created_at)}</td>
                <td className="p-3">{l.profiles?.username ?? "-"}</td>
                <td className="p-3 font-mono text-xs">{l.action}</td>
                <td className="p-3 text-xs">{l.entity} {l.entity_id ? `#${l.entity_id.slice(0,8)}` : ""}</td>
                <td className="p-3 text-xs text-muted-foreground max-w-md truncate">{l.meta ? JSON.stringify(l.meta) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
