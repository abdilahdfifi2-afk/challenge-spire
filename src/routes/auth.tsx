import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "دخول / تسجيل — ArenaX" },
      { name: "description", content: "سجّل دخولك أو أنشئ حساباً جديداً في منصة ArenaX." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [tab, setTab] = useState<"signin" | "signup" | "reset">("signin");

  const goNext = () => nav({ to: (redirect as any) || "/" });

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-4 py-10">
      <div className="w-full max-w-md card-elevated p-6 md:p-8">
        <div className="text-center mb-6">
          <div className="mx-auto h-12 w-12 rounded-xl gradient-primary glow-primary grid place-items-center text-primary-foreground text-xl font-display font-bold">A</div>
          <h1 className="mt-3 font-display text-2xl font-bold">مرحباً بك في ArenaX</h1>
          <p className="text-sm text-muted-foreground mt-1">ادخل لبدء التنافس والفوز</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="signin">دخول</TabsTrigger>
            <TabsTrigger value="signup">تسجيل</TabsTrigger>
            <TabsTrigger value="reset">استعادة</TabsTrigger>
          </TabsList>
          <TabsContent value="signin"><SignInForm onDone={goNext} /></TabsContent>
          <TabsContent value="signup"><SignUpForm onDone={goNext} /></TabsContent>
          <TabsContent value="reset"><ResetForm /></TabsContent>
        </Tabs>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">أو</span></div>
          </div>
          <Button
            variant="outline"
            className="w-full mt-4 gap-2"
            onClick={async () => {
              const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
              if (res.error) toast.error("فشل تسجيل الدخول بجوجل");
              else if (!res.redirected) goNext();
            }}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.99.66-2.25 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
            متابعة مع Google
          </Button>
        </div>
      </div>
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4 mt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setLoading(false);
        if (error) toast.error(error.message);
        else { toast.success("مرحباً!"); onDone(); }
      }}
    >
      <div><Label>البريد الإلكتروني</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><Label>كلمة المرور</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground border-0">
        {loading ? "جاري الدخول..." : "دخول"}
      </Button>
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="space-y-4 mt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 6) { toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل"); return; }
        setLoading(true);
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { username, display_name: username },
          },
        });
        setLoading(false);
        if (error) toast.error(error.message);
        else { toast.success("تم إنشاء حسابك بنجاح!"); onDone(); }
      }}
    >
      <div><Label>اسم المستخدم</Label><Input required minLength={3} value={username} onChange={(e) => setUsername(e.target.value)} /></div>
      <div><Label>البريد الإلكتروني</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><Label>كلمة المرور</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground border-0">
        {loading ? "جاري التسجيل..." : "إنشاء حساب"}
      </Button>
    </form>
  );
}

function ResetForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <form
      className="space-y-4 mt-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) toast.error(error.message);
        else { setSent(true); toast.success("تم إرسال رابط إعادة التعيين"); }
      }}
    >
      <div><Label>البريد الإلكتروني</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <Button type="submit" className="w-full">إرسال رابط الاستعادة</Button>
      {sent && <p className="text-xs text-success">تفقّد بريدك الإلكتروني.</p>}
    </form>
  );
}
