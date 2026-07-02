import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Trophy, Medal, Crown, Sparkles, Wallet as WalletIcon, Award, Lock, Check } from "lucide-react";

export const Route = createFileRoute("/achievements")({
  head: () => ({
    meta: [
      { title: "الإنجازات — ArenaX" },
      { name: "description", content: "اكتشف جميع الإنجازات المتاحة وتتبع تقدمك." },
      { property: "og:title", content: "الإنجازات — ArenaX" },
      { property: "og:description", content: "افتح إنجازات ArenaX واحصل على نقاط الخبرة." },
    ],
  }),
  component: AchievementsPage,
});

const ICONS: Record<string, typeof Trophy> = {
  trophy: Trophy,
  medal: Medal,
  crown: Crown,
  sparkles: Sparkles,
  wallet: WalletIcon,
};

function AchievementsPage() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ["achievements", user?.id ?? "guest"],
    queryFn: async () => {
      const { data: all } = await supabase
        .from("achievements")
        .select("id, code, title, description, icon, xp_reward")
        .order("xp_reward", { ascending: true });
      let unlocked = new Set<string>();
      if (user) {
        const { data: mine } = await supabase
          .from("user_achievements")
          .select("achievement_id")
          .eq("user_id", user.id);
        unlocked = new Set((mine ?? []).map((m) => m.achievement_id));
      }
      return (all ?? []).map((a) => ({ ...a, unlocked: unlocked.has(a.id) }));
    },
  });

  const total = q.data?.length ?? 0;
  const done = q.data?.filter((a) => a.unlocked).length ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold flex items-center gap-3">
          <Award className="h-7 w-7 text-primary" /> الإنجازات
        </h1>
        <p className="text-muted-foreground mt-2">
          {user ? `${done} / ${total} مفتوحة` : "سجّل الدخول لتتبع إنجازاتك"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(q.data ?? []).map((a) => {
          const Icon = ICONS[a.icon ?? "trophy"] ?? Trophy;
          return (
            <div
              key={a.id}
              className={`p-5 rounded-xl border transition ${
                a.unlocked
                  ? "bg-card border-primary/50 glow-primary"
                  : "bg-card/50 border-border opacity-70"
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className={`h-12 w-12 rounded-lg grid place-items-center ${
                    a.unlocked ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                {a.unlocked ? (
                  <Check className="h-5 w-5 text-primary" />
                ) : (
                  <Lock className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <h3 className="font-display font-bold text-lg">{a.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
              <div className="mt-3 text-xs font-medium text-primary">+{a.xp_reward} XP</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
