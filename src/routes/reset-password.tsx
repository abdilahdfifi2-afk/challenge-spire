import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "إعادة تعيين كلمة المرور — ArenaX" }] }),
  component: ResetPage,
});

function ResetPage() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-4">
      <form
        className="w-full max-w-md card-elevated p-6 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password.length < 6) { toast.error("6 أحرف على الأقل"); return; }
          setLoading(true);
          const { error } = await supabase.auth.updateUser({ password });
          setLoading(false);
          if (error) toast.error(error.message);
          else { toast.success("تم تحديث كلمة المرور"); nav({ to: "/" }); }
        }}
      >
        <h1 className="font-display text-2xl font-bold text-center">كلمة مرور جديدة</h1>
        <div><Label>كلمة المرور الجديدة</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground border-0">
          {loading ? "جاري التحديث..." : "تحديث"}
        </Button>
      </form>
    </div>
  );
}
