import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { UserPlus, Check, X, Users, Trash2 } from "lucide-react";
import { translateFinancialError } from "@/lib/rpc-errors";

export const Route = createFileRoute("/_authenticated/friends")({
  component: FriendsPage,
});

type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
  profile?: { id: string; username: string; display_name: string | null; avatar_url: string | null };
};

function FriendsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  const q = useQuery({
    queryKey: ["friendships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("friendships")
        .select("id, requester_id, addressee_id, status, created_at")
        .order("created_at", { ascending: false });
      const items = (data ?? []) as Friendship[];
      const otherIds = items.map((f) => (f.requester_id === user!.id ? f.addressee_id : f.requester_id));
      const uniq = [...new Set(otherIds)];
      const { data: profs } = uniq.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", uniq)
        : { data: [] };
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return items.map((f) => ({
        ...f,
        profile: map.get(f.requester_id === user!.id ? f.addressee_id : f.requester_id),
      }));
    },
  });

  const send = async () => {
    if (!username.trim()) return;
    setLoading(true);
    const { error } = await supabase.rpc("send_friend_request", { _username: username.trim() });
    setLoading(false);
    if (error) return toast.error(translateFinancialError(error.message));
    toast.success("تم إرسال طلب الصداقة");
    setUsername("");
    qc.invalidateQueries({ queryKey: ["friendships"] });
  };

  const respond = async (id: string, accept: boolean) => {
    const { error } = await supabase.rpc("respond_friend_request", { _fid: id, _accept: accept });
    if (error) return toast.error(translateFinancialError(error.message));
    toast.success(accept ? "تم قبول الصداقة" : "تم الرفض");
    qc.invalidateQueries({ queryKey: ["friendships"] });
  };

  const remove = async (id: string) => {
    const { error } = await supabase.rpc("remove_friend", { _fid: id });
    if (error) return toast.error(translateFinancialError(error.message));
    toast.success("تم الحذف");
    qc.invalidateQueries({ queryKey: ["friendships"] });
  };

  const items = q.data ?? [];
  const incoming = items.filter((f) => f.status === "pending" && f.addressee_id === user?.id);
  const outgoing = items.filter((f) => f.status === "pending" && f.requester_id === user?.id);
  const accepted = items.filter((f) => f.status === "accepted");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" /> الأصدقاء
        </h1>
      </div>

      <div className="p-5 rounded-xl bg-card border border-border mb-8">
        <label className="text-sm font-medium mb-2 block">إضافة صديق باسم المستخدم</label>
        <div className="flex gap-2">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <Button onClick={send} disabled={loading} className="gap-2">
            <UserPlus className="h-4 w-4" /> إرسال
          </Button>
        </div>
      </div>

      {incoming.length > 0 && (
        <Section title={`طلبات واردة (${incoming.length})`}>
          {incoming.map((f) => (
            <Row key={f.id} f={f}>
              <Button size="sm" onClick={() => respond(f.id, true)} className="gap-1">
                <Check className="h-4 w-4" /> قبول
              </Button>
              <Button size="sm" variant="outline" onClick={() => respond(f.id, false)} className="gap-1">
                <X className="h-4 w-4" /> رفض
              </Button>
            </Row>
          ))}
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title={`طلبات مُرسَلة (${outgoing.length})`}>
          {outgoing.map((f) => (
            <Row key={f.id} f={f}>
              <span className="text-xs text-muted-foreground">بانتظار الرد</span>
              <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Row>
          ))}
        </Section>
      )}

      <Section title={`الأصدقاء (${accepted.length})`}>
        {accepted.length === 0 && <div className="text-muted-foreground text-sm">لا يوجد أصدقاء بعد</div>}
        {accepted.map((f) => (
          <Row key={f.id} f={f}>
            <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-display font-semibold text-lg mb-3">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({ f, children }: { f: Friendship; children: React.ReactNode }) {
  const name = f.profile?.display_name ?? f.profile?.username ?? "لاعب";
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
      <div className="h-10 w-10 rounded-full gradient-primary grid place-items-center text-primary-foreground font-bold">
        {f.profile?.avatar_url ? (
          <img src={f.profile.avatar_url} alt={name} className="h-full w-full rounded-full object-cover" />
        ) : (
          name.slice(0, 1)
        )}
      </div>
      <div className="flex-1">
        <div className="font-medium">{name}</div>
        {f.profile?.username && <div className="text-xs text-muted-foreground">@{f.profile.username}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
