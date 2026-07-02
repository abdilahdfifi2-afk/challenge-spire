import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, CheckCircle2, Lock, Unlock, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { translateFinancialError } from "@/lib/rpc-errors";

export const Route = createFileRoute("/_authenticated/admin/predictions")({
  component: PredictionsAdmin,
});

const SPORTS = ["كرة القدم", "كرة السلة", "التنس", "UFC", "الهوكي", "البيسبول"];
const GAMES = ["EA SPORTS FC", "PUBG Mobile", "Call of Duty", "Valorant", "League of Legends", "Dota 2", "Counter-Strike 2", "Free Fire", "Fortnite", "Rocket League"];

function PredictionsAdmin() {
  const qc = useQueryClient();
  const [openMatch, setOpenMatch] = useState(false);
  const [editingMatch, setEditingMatch] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const matchesQ = useQuery({
    queryKey: ["admin-matches"],
    queryFn: async () => (await supabase.from("matches").select("*").order("start_time", { ascending: false })).data ?? [],
  });

  useEffect(() => {
    const ch = supabase.channel("admin-preds")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => qc.invalidateQueries({ queryKey: ["admin-matches"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "match_markets" }, () => qc.invalidateQueries({ queryKey: ["admin-markets"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const saveMatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      _sport: String(fd.get("sport") || ""),
      _tournament: String(fd.get("tournament") || ""),
      _team1_name: String(fd.get("team1_name") || ""),
      _team1_logo: String(fd.get("team1_logo") || ""),
      _team2_name: String(fd.get("team2_name") || ""),
      _team2_logo: String(fd.get("team2_logo") || ""),
      _start_time: new Date(String(fd.get("start_time") || "")).toISOString(),
    };
    if (editingMatch) {
      const { error } = await supabase.rpc("admin_update_match", {
        _match_id: editingMatch.id, ...payload, _status: String(fd.get("status") || "scheduled") as any,
      });
      if (error) return toast.error(translateFinancialError(error.message));
      toast.success("تم التحديث");
    } else {
      const { error } = await supabase.rpc("admin_create_match", {
        _kind: String(fd.get("kind") || "sport") as any, ...payload,
      });
      if (error) return toast.error(translateFinancialError(error.message));
      toast.success("تم إنشاء المباراة");
    }
    setOpenMatch(false); setEditingMatch(null);
    qc.invalidateQueries({ queryKey: ["admin-matches"] });
  };

  const deleteMatch = async (id: string) => {
    if (!confirm("حذف المباراة؟")) return;
    const { error } = await supabase.rpc("admin_delete_match", { _match_id: id });
    if (error) return toast.error(translateFinancialError(error.message));
    toast.success("تم الحذف");
  };

  const toggle = (id: string) => {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">التوقعات — إدارة المباريات</h1>
        <Dialog open={openMatch} onOpenChange={(o) => { setOpenMatch(o); if (!o) setEditingMatch(null); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 me-1" /> مباراة جديدة</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>{editingMatch ? "تعديل مباراة" : "مباراة جديدة"}</DialogTitle></DialogHeader>
            <form onSubmit={saveMatch} className="space-y-3">
              {!editingMatch && (
                <div><Label>النوع</Label>
                  <select name="kind" defaultValue="sport" className="w-full border border-border rounded-md bg-background px-3 py-2">
                    <option value="sport">رياضة</option><option value="esport">إلكترونية</option>
                  </select>
                </div>
              )}
              <div><Label>الرياضة/اللعبة</Label>
                <Input name="sport" required defaultValue={editingMatch?.sport} list="sport-list" />
                <datalist id="sport-list">{[...SPORTS, ...GAMES].map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <div><Label>البطولة</Label><Input name="tournament" defaultValue={editingMatch?.tournament || ""} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>الفريق 1</Label><Input name="team1_name" required defaultValue={editingMatch?.team1_name} /></div>
                <div><Label>شعار 1 (URL)</Label><Input name="team1_logo" defaultValue={editingMatch?.team1_logo || ""} /></div>
                <div><Label>الفريق 2</Label><Input name="team2_name" required defaultValue={editingMatch?.team2_name} /></div>
                <div><Label>شعار 2 (URL)</Label><Input name="team2_logo" defaultValue={editingMatch?.team2_logo || ""} /></div>
              </div>
              <div><Label>وقت البداية</Label>
                <Input type="datetime-local" name="start_time" required
                  defaultValue={editingMatch?.start_time ? new Date(editingMatch.start_time).toISOString().slice(0, 16) : ""} />
              </div>
              {editingMatch && (
                <div><Label>الحالة</Label>
                  <select name="status" defaultValue={editingMatch.status} className="w-full border border-border rounded-md bg-background px-3 py-2">
                    <option value="scheduled">قادمة</option><option value="live">مباشرة</option>
                    <option value="finished">منتهية</option><option value="cancelled">ملغاة</option>
                  </select>
                </div>
              )}
              <DialogFooter><Button type="submit">حفظ</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {(matchesQ.data ?? []).length === 0 && <div className="card-elevated p-8 text-center text-muted-foreground">لا توجد مباريات.</div>}
        {(matchesQ.data ?? []).map((m: any) => (
          <div key={m.id} className="card-elevated overflow-hidden">
            <div className="p-3 flex items-center gap-3 flex-wrap">
              <button onClick={() => toggle(m.id)} className="text-muted-foreground hover:text-foreground">
                {expanded.has(m.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-border text-muted-foreground uppercase">{m.kind}</span>
              <span className="text-xs text-muted-foreground">{m.sport}</span>
              <span className="font-semibold truncate">{m.team1_name} × {m.team2_name}</span>
              <span className="text-xs text-muted-foreground ms-auto">{formatDate(m.start_time)}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{m.status}</span>
              <Button size="icon" variant="ghost" onClick={() => { setEditingMatch(m); setOpenMatch(true); }}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => deleteMatch(m.id)}><Trash2 className="h-4 w-4 text-red-400" /></Button>
            </div>
            {expanded.has(m.id) && <MarketsPanel matchId={m.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketsPanel({ matchId }: { matchId: string }) {
  const qc = useQueryClient();
  const [openMk, setOpenMk] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [settling, setSettling] = useState<any>(null);

  const marketsQ = useQuery({
    queryKey: ["admin-markets", matchId],
    queryFn: async () => (await supabase.from("match_markets").select("*").eq("match_id", matchId).order("created_at")).data ?? [],
  });

  const marketIds = (marketsQ.data ?? []).map((m: any) => m.id);
  const optionsQ = useQuery({
    queryKey: ["admin-market-options", matchId, marketIds.join(",")],
    enabled: marketIds.length > 0,
    queryFn: async () => (await supabase.from("market_options").select("*").in("market_id", marketIds).order("sort_order")).data ?? [],
  });
  const entriesQ = useQuery({
    queryKey: ["admin-market-entries", matchId, marketIds.join(",")],
    enabled: marketIds.length > 0,
    queryFn: async () => (await supabase.from("market_entries").select("market_id, amount, option_id").in("market_id", marketIds)).data ?? [],
  });

  const saveMarket = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const opts = String(fd.get("options") || "").split("\n").map((s) => s.trim()).filter(Boolean);
    const args = {
      _title: String(fd.get("title") || ""),
      _market_type: String(fd.get("market_type") || "custom"),
      _min_stake: parseFloat(String(fd.get("min_stake") || "10")),
      _max_stake: parseFloat(String(fd.get("max_stake") || "1000")),
      _commission_pct: parseFloat(String(fd.get("commission_pct") || "10")),
      _closes_at: new Date(String(fd.get("closes_at") || "")).toISOString(),
    };
    if (editing) {
      const { error } = await supabase.rpc("admin_update_market", { _market_id: editing.id, ...args });
      if (error) return toast.error(translateFinancialError(error.message));
      toast.success("تم التحديث");
    } else {
      const { error } = await supabase.rpc("admin_create_market", { _match_id: matchId, ...args, _options: opts });
      if (error) return toast.error(translateFinancialError(error.message));
      toast.success("تم إنشاء السوق");
    }
    setOpenMk(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-markets", matchId] });
    qc.invalidateQueries({ queryKey: ["admin-market-options", matchId] });
  };

  const voidMarket = async (id: string) => {
    if (!confirm("إلغاء السوق ورد كل المبالغ (تعادل/إلغاء)؟")) return;
    const { error } = await supabase.rpc("admin_void_market", { _market_id: id, _reason: "تعادل أو إلغاء" });
    if (error) return toast.error(translateFinancialError(error.message));
    toast.success("تم رد كل المبالغ");
  };


  const setStatus = async (id: string, status: "open" | "closed") => {
    const { error } = await supabase.rpc("admin_set_market_status", { _market_id: id, _status: status });
    if (error) return toast.error(translateFinancialError(error.message));
    toast.success("تم التحديث");
  };

  const del = async (id: string) => {
    if (!confirm("حذف السوق؟")) return;
    const { error } = await supabase.rpc("admin_delete_market", { _market_id: id });
    if (error) return toast.error(translateFinancialError(error.message));
    toast.success("تم الحذف");
  };

  const settle = async (marketId: string, optionId: string) => {
    if (!confirm("تأكيد تسوية السوق وتوزيع الجوائز؟")) return;
    const { error } = await supabase.rpc("admin_settle_market", { _market_id: marketId, _winning_option_id: optionId });
    if (error) return toast.error(translateFinancialError(error.message));
    toast.success("تمت التسوية وتوزيع الجوائز");
    setSettling(null);
  };

  return (
    <div className="border-t border-border bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-muted-foreground">أسواق التوقعات</div>
        <Dialog open={openMk} onOpenChange={(o) => { setOpenMk(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 me-1" /> سوق جديد</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "تعديل سوق" : "سوق جديد"}</DialogTitle></DialogHeader>
            <form onSubmit={saveMarket} className="space-y-3">
              <div><Label>العنوان</Label><Input name="title" required defaultValue={editing?.title} placeholder="الفائز بالمباراة" /></div>
              <div><Label>نوع السوق (مفتاح)</Label><Input name="market_type" defaultValue={editing?.market_type || "winner"} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>الحد الأدنى للرهان (د.م)</Label><Input type="number" step="1" name="min_stake" required defaultValue={editing?.min_stake ?? 10} /></div>
                <div><Label>الحد الأقصى للرهان (د.م)</Label><Input type="number" step="1" name="max_stake" required defaultValue={editing?.max_stake ?? 1000} /></div>
              </div>
              <div><Label>عمولة % (من مجموع الرهانات)</Label><Input type="number" step="0.5" name="commission_pct" required defaultValue={editing?.commission_pct ?? 10} /></div>

              <div><Label>يغلق في</Label>
                <Input type="datetime-local" name="closes_at" required
                  defaultValue={editing?.closes_at ? new Date(editing.closes_at).toISOString().slice(0, 16) : ""} />
              </div>
              {!editing && (
                <div><Label>الخيارات (سطر لكل خيار، حد أدنى 2)</Label>
                  <textarea name="options" required rows={5} className="w-full border border-border rounded-md bg-background px-3 py-2 font-mono text-sm" placeholder="الفريق 1&#10;تعادل&#10;الفريق 2" />
                </div>
              )}
              <DialogFooter><Button type="submit">حفظ</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {(marketsQ.data ?? []).length === 0 && <div className="text-xs text-muted-foreground text-center py-3">لا توجد أسواق.</div>}
      {(marketsQ.data ?? []).map((mk: any) => {
        const opts = (optionsQ.data ?? []).filter((o: any) => o.market_id === mk.id);
        const entries = (entriesQ.data ?? []).filter((e: any) => e.market_id === mk.id);
        const pool = entries.reduce((s: number, e: any) => s + Number(e.amount), 0);
        return (
          <div key={mk.id} className="border border-border rounded-lg p-3 bg-background space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{mk.title}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">{mk.status}</span>
              <span className="text-xs text-muted-foreground">رسوم {formatCurrency(mk.entry_fee)}</span>
              <span className="text-xs text-muted-foreground">مشاركون: {entries.length}</span>
              <span className="text-xs text-primary font-semibold">مجموع: {formatCurrency(pool)}</span>
              <span className="text-xs text-muted-foreground ms-auto">يغلق: {formatDate(mk.closes_at)}</span>
            </div>
            <div className="grid gap-1.5">
              {opts.map((o: any) => {
                const count = entries.filter((e: any) => e.option_id === o.id).length;
                const isWin = mk.winning_option_id === o.id;
                return (
                  <div key={o.id} className={`text-xs flex items-center gap-2 px-2 py-1.5 rounded border ${isWin ? "border-emerald-500/40 bg-emerald-500/10" : "border-border"}`}>
                    {isWin && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                    <span className="flex-1">{o.label}</span>
                    <span className="text-muted-foreground">{count} توقّع</span>
                    {["open", "closed"].includes(mk.status) && settling?.id === mk.id && (
                      <Button size="sm" variant="outline" onClick={() => settle(mk.id, o.id)}>تسوية عليه</Button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {mk.status === "open" && <Button size="sm" variant="outline" onClick={() => setStatus(mk.id, "closed")}><Lock className="h-3.5 w-3.5 me-1" /> إغلاق</Button>}
              {mk.status === "closed" && <Button size="sm" variant="outline" onClick={() => setStatus(mk.id, "open")}><Unlock className="h-3.5 w-3.5 me-1" /> إعادة فتح</Button>}
              {["open", "closed"].includes(mk.status) && (
                <Button size="sm" variant={settling?.id === mk.id ? "default" : "outline"} onClick={() => setSettling(settling?.id === mk.id ? null : mk)}>
                  <Trophy className="h-3.5 w-3.5 me-1" /> {settling?.id === mk.id ? "إلغاء" : "تسوية النتيجة"}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => { setEditing(mk); setOpenMk(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => del(mk.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
