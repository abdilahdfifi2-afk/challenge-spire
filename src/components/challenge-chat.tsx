import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Send, ImagePlus, Check, CheckCheck, Trash2, ShieldAlert, Loader2 } from "lucide-react";

type Msg = {
  id: string;
  challenge_id: string;
  sender_id: string;
  message: string | null;
  message_type: "text" | "image" | "system";
  image_url: string | null;
  is_read: boolean;
  created_at: string;
  sender?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
};

type ChallengeLite = {
  id: string;
  creator_id: string;
  opponent_id: string | null;
  status: string;
};

function timeShort(iso: string) {
  try {
    return new Intl.DateTimeFormat("ar-MA", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return ""; }
}

function initials(name?: string | null) {
  if (!name) return "؟";
  return name.trim().slice(0, 2).toUpperCase();
}

export function ChallengeChat({ challenge, hasOpenDispute }: { challenge: ChallengeLite; hasOpenDispute: boolean }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, number>>({});
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const signedUrlCache = useRef<Record<string, string>>({});
  const [signed, setSigned] = useState<Record<string, string>>({});

  const isParticipant = !!user && (user.id === challenge.creator_id || user.id === challenge.opponent_id);
  const canWrite = isParticipant && (
    (challenge.status !== "completed" && challenge.status !== "cancelled") || hasOpenDispute
  );

  const q = useQuery({
    queryKey: ["chat", challenge.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, sender:profiles!messages_sender_id_fkey(username, display_name, avatar_url)")
        .eq("challenge_id", challenge.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Msg[];
    },
    enabled: !!user,
  });

  // Realtime: messages + typing (broadcast)
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`chat:${challenge.id}`, { config: { broadcast: { self: false } } });
    ch.on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `challenge_id=eq.${challenge.id}` },
      () => qc.invalidateQueries({ queryKey: ["chat", challenge.id] }));
    ch.on("broadcast", { event: "typing" }, (payload: any) => {
      const uid = payload?.payload?.user_id;
      if (!uid || uid === user.id) return;
      setTypingUsers((t) => ({ ...t, [uid]: Date.now() }));
    });
    ch.subscribe();
    const iv = setInterval(() => {
      setTypingUsers((t) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(t)) if (now - v < 3000) next[k] = v;
        return next;
      });
    }, 1000);
    return () => { supabase.removeChannel(ch); clearInterval(iv); };
  }, [challenge.id, qc, user]);

  // Auto-scroll on new messages
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [q.data?.length]);

  // Mark others' messages as read
  useEffect(() => {
    if (!user || !q.data) return;
    const unread = q.data.filter((m) => !m.is_read && m.sender_id !== user.id).map((m) => m.id);
    if (unread.length === 0) return;
    supabase.from("messages").update({ is_read: true }).in("id", unread).then(() => { /* no-op */ });
  }, [q.data, user]);

  // Sign image URLs from private bucket
  useEffect(() => {
    if (!q.data) return;
    (async () => {
      const missing = q.data.filter((m) => m.image_url && !signedUrlCache.current[m.image_url]);
      if (missing.length === 0) return;
      const paths = missing.map((m) => m.image_url!);
      const { data } = await supabase.storage.from("proofs").createSignedUrls(paths, 60 * 60);
      const next = { ...signedUrlCache.current };
      data?.forEach((d, i) => { if (d.signedUrl) next[paths[i]] = d.signedUrl; });
      signedUrlCache.current = next;
      setSigned(next);
    })();
  }, [q.data]);

  const broadcastTyping = useMemo(() => {
    let last = 0;
    return () => {
      if (!user) return;
      const now = Date.now();
      if (now - last < 1500) return;
      last = now;
      supabase.channel(`chat:${challenge.id}`).send({
        type: "broadcast",
        event: "typing",
        payload: { user_id: user.id },
      });
    };
  }, [challenge.id, user]);

  const sendText = async () => {
    if (!user || !text.trim() || !canWrite) return;
    setSending(true);
    const body = text.trim();
    setText("");
    const { error } = await supabase.from("messages").insert({
      challenge_id: challenge.id,
      sender_id: user.id,
      message: body,
      message_type: "text",
    });
    if (error) { toast.error(error.message); setText(body); }
    else {
      // Notify other party
      const otherId = user.id === challenge.creator_id ? challenge.opponent_id : challenge.creator_id;
      if (otherId) {
        await supabase.from("notifications").insert({
          user_id: otherId,
          type: "chat_message",
          title: "رسالة جديدة",
          body: body.slice(0, 120),
          link: `/challenges/${challenge.id}`,
        }).then(() => {});
      }
    }
    setSending(false);
  };

  const onPickImage = () => fileInputRef.current?.click();

  const uploadImage = async (file: File) => {
    if (!user || !canWrite) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("الحد الأقصى 5 ميغابايت"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `chat/${challenge.id}/${user.id}-${Date.now()}.${ext}`;
    const up = await supabase.storage.from("proofs").upload(path, file, { upsert: false, contentType: file.type });
    if (up.error) { toast.error(up.error.message); setUploading(false); return; }
    const { error } = await supabase.from("messages").insert({
      challenge_id: challenge.id,
      sender_id: user.id,
      message_type: "image",
      image_url: path,
    });
    if (error) toast.error(error.message);
    else {
      const otherId = user.id === challenge.creator_id ? challenge.opponent_id : challenge.creator_id;
      if (otherId) {
        await supabase.from("notifications").insert({
          user_id: otherId, type: "chat_message", title: "صورة جديدة", body: "أرسل صورة في الدردشة", link: `/challenges/${challenge.id}`,
        }).then(() => {});
      }
    }
    setUploading(false);
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("تم حذف الرسالة");
  };

  if (!user) return <div className="card-elevated p-6 text-center text-muted-foreground">سجّل دخولك للوصول إلى الدردشة</div>;
  if (!isParticipant && !isAdmin) return <div className="card-elevated p-6 text-center text-muted-foreground flex flex-col items-center gap-2"><ShieldAlert className="h-6 w-6 text-destructive" />هذه الدردشة خاصة بلاعبَي التحدي فقط</div>;

  const typingCount = Object.keys(typingUsers).length;

  return (
    <div className="card-elevated flex flex-col h-[70vh] min-h-[420px]">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="text-sm font-semibold">دردشة التحدي</div>
        <div className="text-xs text-muted-foreground">
          {isAdmin && !isParticipant ? "وضع الأدمن — عرض فقط" : canWrite ? "متصل" : "الدردشة مغلقة"}
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-3 bg-background/40">
        {q.isLoading && <div className="text-center text-xs text-muted-foreground">جاري التحميل…</div>}
        {q.data?.length === 0 && <div className="text-center text-xs text-muted-foreground">لا توجد رسائل بعد — ابدأ المحادثة!</div>}
        {q.data?.map((m) => {
          const mine = m.sender_id === user.id;
          const name = m.sender?.display_name || m.sender?.username || "لاعب";
          return (
            <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <div className="shrink-0">
                {m.sender?.avatar_url ? (
                  <img src={m.sender.avatar_url} alt={name} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-semibold">{initials(name)}</div>
                )}
              </div>
              <div className={`max-w-[75%] group ${mine ? "items-end text-end" : "items-start text-start"} flex flex-col`}>
                <div className={`text-[11px] text-muted-foreground mb-0.5 ${mine ? "text-end" : "text-start"}`}>{name} · {timeShort(m.created_at)}</div>
                <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${mine ? "bg-primary text-primary-foreground rounded-bl-2xl rounded-br-sm" : "bg-muted text-foreground rounded-br-2xl rounded-bl-sm"}`}>
                  {m.message_type === "image" && m.image_url ? (
                    signed[m.image_url] ? (
                      <a href={signed[m.image_url]} target="_blank" rel="noreferrer">
                        <img src={signed[m.image_url]} alt="مرفق" className="max-h-56 rounded-lg" />
                      </a>
                    ) : <div className="flex items-center gap-2 text-xs opacity-80"><Loader2 className="h-3 w-3 animate-spin" /> جارٍ التحميل…</div>
                  ) : (
                    <span>{m.message}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                  {mine && (m.is_read ? <span className="flex items-center gap-0.5 text-accent"><CheckCheck className="h-3 w-3" /> تمت القراءة</span> : <span className="flex items-center gap-0.5"><Check className="h-3 w-3" /> تم الإرسال</span>)}
                  {isAdmin && (
                    <button onClick={() => deleteMessage(m.id)} className="text-destructive hover:underline flex items-center gap-0.5"><Trash2 className="h-3 w-3" /> حذف</button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {typingCount > 0 && (
          <div className="text-xs text-muted-foreground italic flex items-center gap-1">
            <span className="inline-flex gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /><span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:150ms]" /><span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse [animation-delay:300ms]" /></span>
            جاري الكتابة…
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        {!canWrite && (
          <div className="text-xs text-muted-foreground text-center py-2">
            {isAdmin && !isParticipant ? "لا يمكن للأدمن الكتابة في الدردشة (عرض فقط)." : "الدردشة مغلقة — انتهى التحدي أو أُلغِي."}
          </div>
        )}
        {canWrite && (
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }} />
            <Button type="button" size="icon" variant="outline" onClick={onPickImage} disabled={uploading} title="رفع صورة">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            </Button>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); broadcastTyping(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); } }}
              placeholder="اكتب رسالتك…"
              rows={1}
              className="flex-1 resize-none bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 max-h-32"
            />
            <Button type="button" onClick={sendText} disabled={sending || !text.trim()} className="gradient-primary text-primary-foreground border-0">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
