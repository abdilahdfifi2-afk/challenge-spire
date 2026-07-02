import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/challenges/create")({
  head: () => ({ meta: [{ title: "إنشاء تحدي — ArenaX" }] }),
  component: CreateChallengePage,
});

function CreateChallengePage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const games = useQuery({
    queryKey: ["games-active"],
    queryFn: async () => (await supabase.from("games").select("id,name").eq("is_active", true).order("name")).data ?? [],
  });
  const [loading, setLoading] = useState(false);
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.from("challenges").insert({
      creator_id: user.id,
      game_id: String(fd.get("game_id")),
      entry_fee: parseFloat(String(fd.get("entry_fee") || "0")),
      prize: parseFloat(String(fd.get("prize") || "0")),
      title: String(fd.get("title") || "") || null,
      rules: String(fd.get("rules") || "") || null,
      status: "open",
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم نشر التحدي");
    nav({ to: "/challenges" });
  };
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold mb-6">إنشاء تحدي جديد</h1>
      <form onSubmit={submit} className="card-elevated p-6 space-y-4">
        <div>
          <Label>اللعبة</Label>
          <select name="game_id" required className="w-full h-10 rounded-md border border-input bg-transparent px-3">
            <option value="">اختر لعبة</option>
            {games.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div><Label>العنوان</Label><Input name="title" placeholder="مثال: تحدي 1v1 على FIFA" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>رسوم الدخول (MAD)</Label><Input name="entry_fee" type="number" step="0.01" min="0" defaultValue="0" required /></div>
          <div><Label>الجائزة (MAD)</Label><Input name="prize" type="number" step="0.01" min="0" defaultValue="0" required /></div>
        </div>
        <div><Label>قوانين المباراة</Label><Textarea name="rules" rows={4} placeholder="اذكر شروط المباراة، المدة، وأي قواعد..." /></div>
        <Button disabled={loading} className="w-full gradient-primary text-primary-foreground border-0">
          {loading ? "جاري النشر..." : "نشر التحدي"}
        </Button>
      </form>
    </div>
  );
}
