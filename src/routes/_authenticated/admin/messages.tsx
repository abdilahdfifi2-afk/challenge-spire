import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { MessagesSquare, Trash2, Loader2, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/messages")({
  head: () => ({ meta: [{ title: "الدردشات — إدارة" }] }),
  component: AdminMessagesPage,
});

function AdminMessagesPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const threads = useQuery({
    queryKey: ["admin-chat-threads"],
    queryFn: async () => {
      // Aggregate latest message per challenge
      const { data } = await supabase
        .from("messages")
        .select("challenge_id, created_at, message, message_type, sender_id")
        .order("created_at", { ascending: false })
        .limit(300);
      const map = new Map<string, any>();
      (data ?? []).forEach((m) => { if (!map.has(m.challenge_id)) map.set(m.challenge_id, m); });
      const ids = Array.from(map.keys());
      if (ids.length === 0) return [];
      const { data: chs } = await supabase.from("challenges").select("id, title, status, games(name, slug)").in("id", ids);
      const chMap = Object.fromEntries((chs ?? []).map((c: any) => [c.id, c]));
      return ids.map((id) => ({ id, last: map.get(id), challenge: chMap[id] }));
    },
  });

  const messages = useQuery({
    queryKey: ["admin-chat", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase.from("messages").select("*").eq("challenge_id", selected!).order("created_at", { ascending: true });
      const rows = (data ?? []) as any[];
      const ids = Array.from(new Set(rows.map((r) => r.sender_id)));
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids) : { data: [] as any[] };
      const map = Object.fromEntries((profs ?? []).map((p: any) => [p.id, p]));
      return rows.map((r) => ({ ...r, sender: map[r.sender_id] }));
    },
  });

  useEffect(() => {
    const ch = supabase.channel("admin-msgs-rt").on("postgres_changes", { event: "*", schema: "public", table: "messages" },
      () => { qc.invalidateQueries({ queryKey: ["admin-chat-threads"] }); if (selected) qc.invalidateQueries({ queryKey: ["admin-chat", selected] }); }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, selected]);

  const [signed, setSigned] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!messages.data) return;
    (async () => {
      const paths = messages.data.filter((m: any) => m.image_url).map((m: any) => m.image_url as string);
      if (paths.length === 0) return;
      const { data } = await supabase.storage.from("proofs").createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      data?.forEach((d, i) => { if (d.signedUrl) map[paths[i]] = d.signedUrl; });
      setSigned(map);
    })();
  }, [messages.data]);

  const del = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("تم الحذف");
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold flex items-center gap-2 mb-4"><MessagesSquare className="h-6 w-6 text-primary" /> دردشات التحديات</h1>

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <div className="card-elevated p-2 max-h-[70vh] overflow-y-auto">
          {threads.isLoading && <div className="p-4 text-xs text-muted-foreground text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>}
          {threads.data?.length === 0 && <div className="p-4 text-xs text-muted-foreground text-center">لا توجد دردشات</div>}
          {threads.data?.map((t: any) => (
            <button key={t.id} onClick={() => setSelected(t.id)} className={`w-full text-start p-3 rounded-md hover:bg-muted transition-colors ${selected === t.id ? "bg-primary/10 border border-primary/30" : ""}`}>
              <div className="text-sm font-semibold truncate">{t.challenge?.title ?? "تحدي"}</div>
              <div className="text-[11px] text-accent">{t.challenge?.games?.name}</div>
              <div className="text-xs text-muted-foreground truncate mt-1">{t.last.message_type === "image" ? "📷 صورة" : t.last.message}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{formatDate(t.last.created_at)}</div>
            </button>
          ))}
        </div>

        <div className="card-elevated p-4 min-h-[70vh]">
          {!selected && <div className="text-center text-muted-foreground p-8">اختر محادثة للعرض</div>}
          {selected && (
            <>
              <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
                <div className="text-sm text-muted-foreground">محادثة التحدي</div>
                <Link to="/challenges/$challengeId" params={{ challengeId: selected }}>
                  <Button size="sm" variant="outline" className="gap-1"><ExternalLink className="h-3 w-3" /> فتح التحدي</Button>
                </Link>
              </div>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {messages.data?.map((m: any) => (
                  <div key={m.id} className="flex gap-2 group">
                    {m.sender?.avatar_url ? <img src={m.sender.avatar_url} className="h-8 w-8 rounded-full" alt="" /> : <div className="h-8 w-8 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center">{(m.sender?.display_name || m.sender?.username || "?").slice(0, 2)}</div>}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-muted-foreground">{m.sender?.display_name || m.sender?.username || "لاعب"} · {formatDate(m.created_at)}</div>
                      <div className="mt-0.5 text-sm bg-muted rounded-lg px-3 py-2 inline-block max-w-full">
                        {m.message_type === "image" && m.image_url ? (
                          signed[m.image_url] ? <a href={signed[m.image_url]} target="_blank" rel="noreferrer"><img src={signed[m.image_url]} className="max-h-48 rounded" alt="" /></a> : <span className="text-xs">جارٍ التحميل…</span>
                        ) : m.message}
                      </div>
                    </div>
                    <button onClick={() => del(m.id)} className="opacity-0 group-hover:opacity-100 text-destructive text-xs flex items-center gap-1 self-start mt-6"><Trash2 className="h-3 w-3" /> حذف</button>
                  </div>
                ))}
                {messages.data?.length === 0 && <div className="text-center text-xs text-muted-foreground p-4">لا توجد رسائل</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
