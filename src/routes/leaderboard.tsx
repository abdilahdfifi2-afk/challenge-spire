import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({ meta: [{ title: "التصنيف — ArenaX" }] }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const list = useQuery({
    queryKey: ["leaderboard-full"],
    queryFn: async () => (await supabase.from("profiles").select("id,username,display_name,rank_points,level,wins,losses,avatar_url").order("rank_points", { ascending: false }).limit(100)).data ?? [],
  });
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2 mb-6"><Trophy className="h-7 w-7 text-primary" /> التصنيف العام</h1>
      <div className="card-elevated overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30"><tr className="text-right">
            <th className="p-3">#</th><th className="p-3">اللاعب</th><th className="p-3">المستوى</th><th className="p-3">V/L</th><th className="p-3">النقاط</th>
          </tr></thead>
          <tbody>
            {list.data?.map((p, i) => (
              <tr key={p.id} className="border-t border-border hover:bg-muted/20">
                <td className="p-3"><span className={`inline-grid place-items-center h-7 w-7 rounded-full text-xs font-bold ${i<3?"gradient-primary text-primary-foreground":"bg-muted"}`}>{i+1}</span></td>
                <td className="p-3 font-medium">{p.display_name ?? p.username}</td>
                <td className="p-3">Lv {p.level}</td>
                <td className="p-3 text-xs"><span className="text-success">{p.wins}</span> / <span className="text-destructive">{p.losses}</span></td>
                <td className="p-3 font-bold text-gradient-primary">{p.rank_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
