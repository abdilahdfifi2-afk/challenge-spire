import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { pickBanner, PREDICTION_BANNERS } from "@/lib/media";
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
          <div key={p.id} className="card-elevated overflow-hidden group">
            <div className="relative h-40 overflow-hidden">
              <img src={p.image_url || pickBanner(PREDICTION_BANNERS, p.id)} alt={p.title} loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
              <span className="absolute top-3 end-3 text-xs px-2 py-1 rounded-full bg-primary/20 text-primary backdrop-blur">{p.status}</span>
            </div>
            <div className="p-5">
              <h3 className="font-display text-lg font-semibold">{p.title}</h3>
              {p.description && <p className="text-sm text-muted-foreground mt-1">{p.description}</p>}
              <div className="mt-3 flex items-center justify-between text-sm">
                <span>الرسوم: {formatCurrency(p.entry_fee)}</span>
                <span className="font-bold text-gradient-primary">{formatCurrency(p.prize_pool)}</span>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">ينتهي: {formatDate(p.closes_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
