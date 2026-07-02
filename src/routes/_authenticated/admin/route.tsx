import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Users, Landmark, ArrowDownCircle, ArrowUpCircle, Gamepad2, Trophy, Target, AlertTriangle, ScrollText, MessagesSquare } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userData.user.id);
    const isAdmin = roles?.some((r) => r.role === "admin");
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: AdminLayout,
});

const items = [
  { to: "/admin", label: "لوحة القيادة", icon: Shield, exact: true },
  { to: "/admin/users", label: "المستخدمون", icon: Users },
  { to: "/admin/banks", label: "البنوك", icon: Landmark },
  { to: "/admin/deposits", label: "الإيداعات", icon: ArrowDownCircle },
  { to: "/admin/withdrawals", label: "السحوبات", icon: ArrowUpCircle },
  { to: "/admin/games", label: "الألعاب", icon: Gamepad2 },
  { to: "/admin/tournaments", label: "البطولات", icon: Trophy },
  { to: "/admin/predictions", label: "التوقعات", icon: Target },
  { to: "/admin/disputes", label: "النزاعات", icon: AlertTriangle },
  { to: "/admin/messages", label: "الدردشات", icon: MessagesSquare },
  { to: "/admin/logs", label: "سجل التدقيق", icon: ScrollText },
];

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 grid md:grid-cols-[220px_1fr] gap-6">
      <aside className="card-elevated p-3 h-fit md:sticky md:top-20">
        <div className="px-2 py-1.5 mb-2">
          <div className="text-xs text-muted-foreground">لوحة الإدارة</div>
          <div className="font-display font-bold text-primary">ArenaX Admin</div>
        </div>
        <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {items.map((it) => {
            const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
            return (
              <Link key={it.to} to={it.to as any} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm whitespace-nowrap ${active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
                <it.icon className="h-4 w-4" /> <span className="hidden md:inline">{it.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0"><Outlet /></div>
    </div>
  );
}
