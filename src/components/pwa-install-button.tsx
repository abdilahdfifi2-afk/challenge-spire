import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallButton() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (standalone) { setInstalled(true); return; }
    const ua = window.navigator.userAgent.toLowerCase();
    const iOS = /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
    setIsIos(iOS);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  if (isIos && !deferred) {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowIosHint((s) => !s)}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">تحميل التطبيق</span>
        </Button>
        {showIosHint && (
          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[92%] rounded-lg border border-border bg-card p-4 shadow-xl">
            <p className="text-sm font-semibold mb-1">تثبيت ArenaX على iOS</p>
            <p className="text-xs text-muted-foreground">
              افتح قائمة المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية».
            </p>
            <button
              onClick={() => setShowIosHint(false)}
              className="mt-2 text-xs text-primary"
            >
              إغلاق
            </button>
          </div>
        )}
      </>
    );
  }

  if (!deferred) return null;

  const install = async () => {
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
    }
  };

  return (
    <Button size="sm" onClick={install} className="gap-1.5 gradient-primary text-primary-foreground border-0">
      <Download className="h-4 w-4" />
      <span className="hidden sm:inline">تحميل التطبيق</span>
    </Button>
  );
}
