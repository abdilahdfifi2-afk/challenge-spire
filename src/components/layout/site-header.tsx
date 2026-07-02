import { Link, useRouterState } from "@tanstack/react-router";
import { Trophy, Wallet, Home, Swords, Target, User, Shield, Menu, X, LogOut, Crown, Activity, Award, Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { NotificationsMenu } from "./notifications-menu";

const nav = [
  { to: "/", label: "الرئيسية", icon: Home },
  { to: "/challenges", label: "التحديات", icon: Swords },
  { to: "/tournaments", label: "البطولات", icon: Trophy },
  { to: "/predictions", label: "التوقعات", icon: Target },
  { to: "/king-of-arena", label: "ملك الحلبة", icon: Crown },
  { to: "/feed", label: "التغذية", icon: Activity },
  { to: "/achievements", label: "الإنجازات", icon: Award },
  { to: "/leaderboard", label: "التصنيف", icon: Trophy },
] as const;

export function SiteHeader() {
  const { user, isAdmin, signOut } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
      <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <img
              src={logoAsset.url}
              alt="ArenaX"
              width={36}
              height={36}
              className="h-9 w-9 drop-shadow-[0_0_12px_oklch(0.65_0.24_295_/_0.55)] group-hover:scale-110 transition-transform"
            />
            <span className="font-display font-bold text-xl tracking-tight">
              <span className="text-gradient-primary">ArenaX</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {nav.map((n) => {
              const active = pathname === n.to;
              return (
                <Link
                  key={n.to}
                  to={n.to}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <NotificationsMenu />
              <Link to="/wallet" className="hidden sm:inline-flex">
                <Button variant="secondary" size="sm" className="gap-2">
                  <Wallet className="h-4 w-4" /> المحفظة
                </Button>
              </Link>
              <Link to="/friends" className="hidden md:inline-flex">
                <Button variant="ghost" size="sm" className="gap-2">
                  <UsersIcon className="h-4 w-4" /> الأصدقاء
                </Button>
              </Link>
              <Link to="/profile" className="hidden sm:inline-flex">
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="h-4 w-4" /> الملف
                </Button>
              </Link>
              {isAdmin && (
                <Link to="/admin" className="hidden md:inline-flex">
                  <Button variant="outline" size="sm" className="gap-2 border-primary/40 text-primary">
                    <Shield className="h-4 w-4" /> الإدارة
                  </Button>
                </Link>
              )}
              <Button variant="ghost" size="icon" onClick={signOut} title="خروج">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Link to="/auth">
              <Button size="sm" className="gradient-primary text-primary-foreground border-0 glow-primary">
                دخول / تسجيل
              </Button>
            </Link>
          )}
          <button
            className="md:hidden p-2 rounded-md hover:bg-muted"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-background/95">
          <nav className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-1">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-muted"
              >
                <n.icon className="h-4 w-4 text-muted-foreground" />
                {n.label}
              </Link>
            ))}
            {user && (
              <>
                <Link to="/wallet" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-muted">
                  <Wallet className="h-4 w-4 text-muted-foreground" /> المحفظة
                </Link>
                <Link to="/profile" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" /> الملف الشخصي
                </Link>
                {isAdmin && (
                  <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm hover:bg-muted">
                    <Shield className="h-4 w-4 text-primary" /> لوحة الإدارة
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
