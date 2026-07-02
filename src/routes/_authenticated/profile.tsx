import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatDate } from "@/lib/format";
import { Swords, Trophy, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "الملف الشخصي — ArenaX" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
  });
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: String(fd.get("display_name") || ""),
      bio: String(fd.get("bio") || ""),
      country: String(fd.get("country") || ""),
    }).eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("تم الحفظ"); qc.invalidateQueries({ queryKey: ["profile", user.id] }); }
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    const path = `${user.id}/avatar.${file.name.split(".").pop()}`;
    const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (up.error) { toast.error(up.error.message); return; }
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60 * 24 * 365);
    await supabase.from("profiles").update({ avatar_url: data?.signedUrl }).eq("id", user.id);
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    toast.success("تم تحديث الصورة");
  };

  const p = profile.data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="card-elevated p-6 flex flex-col sm:flex-row items-center gap-6">
        <div className="relative">
          <div className="h-24 w-24 rounded-full overflow-hidden gradient-primary grid place-items-center text-3xl font-display font-bold text-primary-foreground">
            {p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : (p?.username?.[0]?.toUpperCase() ?? "?")}
          </div>
          <label className="absolute -bottom-1 -end-1 h-8 w-8 rounded-full bg-accent text-accent-foreground grid place-items-center cursor-pointer text-xs">
            ✎
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
          </label>
        </div>
        <div className="text-center sm:text-start flex-1">
          <h1 className="font-display text-2xl font-bold">{p?.display_name ?? p?.username}</h1>
          <p className="text-sm text-muted-foreground">@{p?.username}</p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs">
            <Stat label="المستوى" value={`Lv ${p?.level ?? 1}`} />
            <Stat label="XP" value={p?.xp ?? 0} />
            <Stat label="النقاط" value={p?.rank_points ?? 1000} />
            <Stat label="الانتصارات" value={p?.wins ?? 0} />
            <Stat label="الهزائم" value={p?.losses ?? 0} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">عضو منذ {formatDate(p?.created_at)}</p>
        </div>
      </div>

      <form onSubmit={save} className="card-elevated p-6 space-y-4">
        <h2 className="font-display text-xl font-semibold">تعديل الملف</h2>
        <div><Label>الاسم المعروض</Label><Input name="display_name" defaultValue={p?.display_name ?? ""} /></div>
        <div><Label>الدولة</Label><Input name="country" defaultValue={p?.country ?? ""} /></div>
        <div><Label>نبذة</Label><Textarea name="bio" rows={3} defaultValue={p?.bio ?? ""} /></div>
        <Button disabled={saving} className="gradient-primary text-primary-foreground border-0">
          {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
        </Button>
      </form>

      <MatchHistory userId={user?.id} />
    </div>
  );
}

function MatchHistory({ userId }: { userId?: string }) {
  const q = useQuery({
    queryKey: ["match-history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("challenges")
        .select("id, title, status, entry_fee, prize, created_at, creator_id, opponent_id, games(name), match_results(claimed_winner, status)")
        .or(`creator_id.eq.${userId},opponent_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  const rows = q.data ?? [];

  return (
    <div className="card-elevated p-6">
      <h2 className="font-display text-xl font-semibold mb-4 flex items-center gap-2">
        <Swords className="h-5 w-5 text-primary" /> سجل المباريات
      </h2>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">لم تلعب أي مباراة بعد.</p>}
      <div className="space-y-2">
        {rows.map((c: any) => {
          const isFinal = c.status === "completed";
          const confirmed = (c.match_results ?? []).find((r: any) => r.status === "confirmed");
          const winnerId = confirmed?.claimed_winner;
          const iWon = winnerId && winnerId === userId;
          const iLost = winnerId && !iWon;
          const opponent = c.creator_id === userId ? c.opponent_id : c.creator_id;
          return (
            <Link key={c.id} to="/challenges/$challengeId" params={{ challengeId: c.id }}
              className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-muted/30 transition">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate flex items-center gap-2">
                  {isFinal && iWon && <Trophy className="h-4 w-4 text-yellow-400" />}
                  {isFinal && iLost && <XCircle className="h-4 w-4 text-destructive" />}
                  {c.title ?? "تحدي"} <span className="text-xs text-muted-foreground">· {c.games?.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {opponent ? "ضد لاعب" : "بانتظار خصم"} · {formatDate(c.created_at)}
                </div>
              </div>
              <div className="text-end">
                <div className={`text-xs px-2 py-0.5 rounded-full ${isFinal ? (iWon ? "bg-success/15 text-success" : iLost ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground") : "bg-primary/15 text-primary"}`}>
                  {isFinal ? (iWon ? "فوز" : iLost ? "خسارة" : "منتهي") : statusAr(c.status)}
                </div>
                {isFinal && iWon && <div className="text-xs font-bold text-neon mt-1">+{formatCurrency(c.prize)}</div>}
                {isFinal && iLost && <div className="text-xs text-destructive mt-1">-{formatCurrency(c.entry_fee)}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function statusAr(s: string) {
  const m: Record<string, string> = { open: "مفتوح", accepted: "في اللوبي", in_progress: "قيد التنفيذ", awaiting_confirmation: "بانتظار", disputed: "نزاع", cancelled: "ملغى" };
  return m[s] ?? s;
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-md bg-muted/40 px-3 py-1.5">
      <span className="text-muted-foreground">{label}:</span> <span className="font-bold text-foreground">{value}</span>
    </div>
  );
}
