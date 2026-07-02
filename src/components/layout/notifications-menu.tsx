import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

interface Notif {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  link: string | null;
}

export function NotificationsMenu() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const unread = items.filter((i) => !i.is_read).length;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from("notifications")
        .select("id,title,body,is_read,created_at,link")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      setItems(data ?? []);
    };
    load();
    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-neon text-neon-foreground text-[10px] font-bold grid place-items-center">
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2 py-1">
          <DropdownMenuLabel className="p-0">الإشعارات</DropdownMenuLabel>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline">
              تعليم الكل كمقروء
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">لا توجد إشعارات بعد</div>
        )}
        <div className="max-h-96 overflow-auto">
          {items.map((n) => (
            <DropdownMenuItem key={n.id} className="flex-col items-start gap-1 py-2">
              <div className="flex items-center gap-2 w-full">
                {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary" />}
                <span className="text-sm font-medium">{n.title}</span>
              </div>
              {n.body && <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
              <span className="text-[10px] text-muted-foreground">{formatDate(n.created_at)}</span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
