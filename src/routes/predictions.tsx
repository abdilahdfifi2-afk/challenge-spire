import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { Target } from "lucide-react";

export const Route = createFileRoute("/predictions")({
  head: () => ({ meta: [{ title: "التوقعات — ArenaX" }] }),
  component: PredictionsPage,
});

function PredictionsPage() {
  const list = useQuery({
    queryKey: ["predictions-list"],
    queryFn: async () => (await supabase.from("predictions").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-3xl font-bold flex items-center gap-2 mb-6"><Target className="h-7 w-7 text-primary" /> التوقعات</h1>
      <div className="grid md:grid-cols-2 gap-4">
        {(list.data ?? []).length === 0 && <div className="card-elevated p-8 text-center text-muted-foreground col-span-full">لا توجد توقعات بعد.</div>}
        {list.data?.map((p) => (
          <div key={p.id} className="card-elevated p-5">
            <h3 className="font-display text-lg font-semibold">{p.title}</h3>
            {p.description && <p className="text-sm text-muted-foreground mt-1">{p.description}</p>}
            <div className="mt-3 flex items-center justify-between text-sm">
              <span>الرسوم: {formatCurrency(p.entry_fee)}</span>
              <span className="font-bold text-gradient-primary">{formatCurrency(p.prize_pool)}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">الحالة: {p.status} — ينتهي: {formatDate(p.closes_at)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
