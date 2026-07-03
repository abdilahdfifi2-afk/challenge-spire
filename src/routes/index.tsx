import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Trophy, Swords, Target, Users, TrendingUp, Zap, Award, Flame,
  ArrowRight, Radio, Clock, Sparkles, ShieldCheck, Rocket, Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import { gameCover, pickBanner, TOURNAMENT_BANNERS } from "@/lib/media";
import logoAsset from "@/assets/arenax-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ArenaX — منصة الألعاب التنافسية والجوائز المالية" },
      { name: "description", content: "نافس، اربح، اصنع اسمك. تحديات لاعب ضد لاعب، بطولات مباشرة، توقعات، وجوائز حقيقية بالدرهم المغربي." },
      { property: "og:title", content: "ArenaX — نافس. اربح. تألق." },
      { property: "og:description", content: "منصة الألعاب التنافسية رقم 1 — تحديات، بطولات، توقعات، وجوائز فورية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const games = useQuery({
    queryKey: ["home-games"],
    queryFn: async () => (await supabase.from("games").select("*").eq("is_active", true).order("name")).data ?? [],
  });
  const tournaments = useQuery({
    queryKey: ["home-tournaments"],
    queryFn: async () => (await supabase.from("tournaments")
      .select("id,title,prize_pool,currency,status,starts_at,banner_url,max_players,entry_fee")
      .in("status", ["open", "in_progress"]).order("created_at", { ascending: false }).limit(4)).data ?? [],
  });
  const challenges = useQuery({
    queryKey: ["home-challenges"],
    queryFn: async () => (await supabase.from("challenges")
      .select("id,title,entry_fee,prize,currency,status,created_at,game_id,games(name,slug)")
      .eq("status", "open").order("created_at", { ascending: false }).limit(6)).data ?? [],
  });
  const matches = useQuery({
    queryKey: ["home-matches"],
    queryFn: async () => (await supabase.from("matches")
      .select("id,kind,sport,tournament,team1_name,team1_logo,team2_name,team2_logo,start_time,status")
      .in("status", ["live", "scheduled"]).order("start_time").limit(4)).data ?? [],
  });
  const leaderboard = useQuery({
    queryKey: ["home-leaderboard"],
    queryFn: async () => (await supabase.from("profiles")
      .select("id,username,display_name,avatar_url,rank_points,level,wins")
      .order("rank_points", { ascending: false }).limit(10)).data ?? [],
  });
  const winners = useQuery({
    queryKey: ["home-winners"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activity_feed")
        .select("id,user_id,type,title,body,meta,created_at")
        .in("type", ["challenge_win", "tournament_win", "prediction_win"])
        .order("created_at", { ascending: false })
        .limit(12);
      const items = data ?? [];
      if (items.length === 0) return [] as any[];
      const ids = [...new Set(items.map((i) => i.user_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id,username,display_name,avatar_url")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      return items.map((i) => ({ ...i, profiles: map.get(i.user_id) }));
    },
  });
  const stats = useQuery({
    queryKey: ["home-stats"],
    queryFn: async () => {
      const [p, t, m, pr] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("tournaments").select("*", { count: "exact", head: true }),
        supabase.from("challenges").select("*", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("challenges").select("prize").eq("status", "completed"),
      ]);
      const prizes = (pr.data ?? []).reduce((s: number, r: any) => s + Number(r.prize ?? 0), 0);
      const BASE = { players: 12480, tournaments: 148, matches: 8630, prizes: 245000 };
      return {
        players: (p.count ?? 0) + BASE.players,
        tournaments: (t.count ?? 0) + BASE.tournaments,
        matches: (m.count ?? 0) + BASE.matches,
        prizes: prizes + BASE.prizes,
      };
    },
  });

  useEffect(() => {
    const ch = supabase.channel("home-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges" }, () => challenges.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => tournaments.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => matches.refetch())
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_feed" }, () => winners.refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden">
      <Hero />

      <div className="mx-auto max-w-7xl px-4 space-y-20 pb-20 -mt-10 relative z-10">
        {/* STATS — Glassmorphism */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <StatGlass icon={Users} label="لاعب نشط" value={stats.data?.players ?? 0} color="primary" />
          <StatGlass icon={Trophy} label="بطولة" value={stats.data?.tournaments ?? 0} color="accent" />
          <StatGlass icon={Swords} label="مباراة مكتملة" value={stats.data?.matches ?? 0} color="neon" />
          <StatGlass icon={TrendingUp} label="د.م جوائز" value={stats.data?.prizes ?? 0} color="primary" isCurrency />
        </section>

        {/* RECENT WINNERS MARQUEE */}
        {(winners.data?.length ?? 0) > 0 && <WinnersMarquee winners={winners.data ?? []} />}

        {/* FEATURED GAMES */}
        <Section title="الألعاب المدعومة" subtitle="اختر لعبتك المفضلة وابدأ التحدي" icon={Flame} link="/challenges">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {games.data?.map((g, i) => (
              <Link key={g.id} to="/challenges" className="group relative overflow-hidden rounded-xl border border-border bg-card hover:border-primary/60 transition-all duration-500"
                style={{ animation: `fade-in 0.5s ease-out ${i * 60}ms both` }}>
                <div className="relative aspect-[3/4] overflow-hidden">
                  <img src={gameCover(g.slug, g.id)} alt={g.name} loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-tr from-primary/20 via-transparent to-accent/20 transition-opacity duration-500" />
                  <div className="absolute bottom-0 inset-x-0 p-3">
                    <div className="text-sm font-semibold text-white drop-shadow text-center">{g.name}</div>
                  </div>
                  <div className="absolute top-2 end-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/80 text-primary-foreground backdrop-blur">العب</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        {/* LIVE TOURNAMENTS */}
        <Section title="البطولات المباشرة" subtitle="انضم قبل انتهاء التسجيل" icon={Trophy} link="/tournaments" liveBadge>
          <div className="grid md:grid-cols-2 gap-4">
            {tournaments.data?.length === 0 && <EmptyMessage>لا توجد بطولات حالياً</EmptyMessage>}
            {tournaments.data?.map((t: any) => (
              <Link key={t.id} to="/tournaments/$tournamentId" params={{ tournamentId: t.id }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card hover:border-primary/60 hover:-translate-y-1 transition-all duration-500">
                <div className="relative h-44 overflow-hidden">
                  <img src={t.banner_url || pickBanner(TOURNAMENT_BANNERS, t.id)} alt={t.title} loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/70 to-transparent" />
                  {t.status === "in_progress" ? (
                    <span className="absolute top-3 end-3 text-[10px] px-2.5 py-1 rounded-full bg-red-500/25 text-red-300 border border-red-500/40 backdrop-blur font-semibold uppercase tracking-wider flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> مباشر
                    </span>
                  ) : (
                    <span className="absolute top-3 end-3 text-[10px] px-2.5 py-1 rounded-full bg-accent/20 text-accent border border-accent/40 backdrop-blur font-semibold uppercase">تسجيل مفتوح</span>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-bold group-hover:text-primary transition-colors">{t.title}</h3>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    <div><div className="text-[10px] text-muted-foreground uppercase">جائزة</div>
                      <div className="text-sm font-bold text-gradient-primary">{formatCurrency(t.prize_pool, t.currency)}</div></div>
                    <div><div className="text-[10px] text-muted-foreground uppercase">دخول</div>
                      <div className="text-sm font-semibold">{formatCurrency(t.entry_fee ?? 0)}</div></div>
                    <div><div className="text-[10px] text-muted-foreground uppercase">لاعب</div>
                      <div className="text-sm font-semibold">{t.max_players}</div></div>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDate(t.starts_at)}</span>
                    <span className="text-primary font-semibold flex items-center gap-1 group-hover:gap-2 transition-all">انضم <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        {/* CHALLENGES */}
        <Section title="أحدث التحديات" subtitle="1v1 مع جوائز فورية" icon={Swords} link="/challenges">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {challenges.data?.length === 0 && <EmptyMessage>لا توجد تحديات مفتوحة</EmptyMessage>}
            {challenges.data?.map((c: any) => (
              <Link key={c.id} to="/challenges/$challengeId" params={{ challengeId: c.id }}
                className="group relative overflow-hidden rounded-xl border border-border bg-card hover:border-accent/60 hover:-translate-y-1 transition-all duration-500">
                <div className="relative h-32 overflow-hidden">
                  <img src={gameCover(c.games?.slug, c.game_id)} alt={c.games?.name ?? "لعبة"} loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                  <span className="absolute top-2 start-2 text-xs text-accent font-semibold bg-background/70 backdrop-blur px-2 py-0.5 rounded">{c.games?.name ?? "لعبة"}</span>
                  <span className="absolute top-2 end-2 text-[10px] px-2 py-0.5 rounded-full bg-primary/30 text-primary border border-primary/40 backdrop-blur font-semibold">مفتوح</span>
                </div>
                <div className="p-4">
                  <h4 className="font-semibold truncate group-hover:text-accent transition-colors">{c.title ?? "تحدي مفتوح"}</h4>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground text-xs">رسوم<br /><span className="text-foreground font-semibold text-sm">{formatCurrency(c.entry_fee)}</span></span>
                    <span className="text-xs text-muted-foreground">جائزة<br /><span className="text-neon font-bold text-base text-glow">{formatCurrency(c.prize)}</span></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        {/* PREDICTIONS / MATCHES */}
        <Section title="توقعات المباريات" subtitle="رياضة وإلكترونية · جوائز مشتركة" icon={Target} link="/predictions">
          <div className="grid md:grid-cols-2 gap-4">
            {matches.data?.length === 0 && <EmptyMessage>لا توجد مباريات حالياً</EmptyMessage>}
            {matches.data?.map((m: any) => (
              <Link key={m.id} to="/predictions/$matchId" params={{ matchId: m.id }}
                className="group glass p-5 hover:border-primary/60 transition-all duration-500 hover:-translate-y-1">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  {m.status === "live" ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/25 text-red-300 border border-red-500/40 font-semibold uppercase flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> مباشر
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 font-semibold uppercase">قادمة</span>
                  )}
                  <span className="text-xs text-muted-foreground">{m.kind === "sport" ? "🏆" : "🎮"} {m.tournament || m.sport}</span>
                  <span className="text-xs text-muted-foreground ms-auto flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDate(m.start_time)}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <TeamMini name={m.team1_name} logo={m.team1_logo} />
                  <div className="text-center text-xs text-muted-foreground font-mono">VS</div>
                  <TeamMini name={m.team2_name} logo={m.team2_logo} reverse />
                </div>
              </Link>
            ))}
          </div>
        </Section>

        {/* LEADERBOARD */}
        <Section title="أفضل اللاعبين" subtitle="التصنيف العام لهذا الموسم" icon={Award} link="/leaderboard">
          <div className="glass p-2 md:p-4">
            <div className="grid gap-1.5">
              {leaderboard.data?.length === 0 && <div className="p-8 text-center text-muted-foreground">لا يوجد لاعبون بعد</div>}
              {leaderboard.data?.map((p: any, i: number) => (
                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-lg transition-all hover:bg-muted/40 ${i < 3 ? "bg-muted/20" : ""}`}>
                  <div className={`grid place-items-center h-9 w-9 rounded-lg font-bold text-sm shrink-0 ${
                    i === 0 ? "gradient-primary text-primary-foreground shadow-lg neon-ring" :
                    i === 1 ? "bg-accent/20 text-accent border border-accent/40" :
                    i === 2 ? "bg-neon/20 text-neon border border-neon/40" :
                    "bg-muted text-muted-foreground"
                  }`}>{i + 1}</div>
                  <div className="h-10 w-10 rounded-full overflow-hidden bg-muted grid place-items-center shrink-0 border border-border">
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                      : <span className="text-xs font-bold">{(p.display_name ?? p.username ?? "?").slice(0, 2)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{p.display_name ?? p.username}</div>
                    <div className="text-xs text-muted-foreground">Lv. {p.level} · {p.wins} انتصار</div>
                  </div>
                  <div className="text-left">
                    <div className="text-xs text-muted-foreground">نقاط</div>
                    <div className="font-bold text-gradient-primary">{p.rank_points ?? 0}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* TESTIMONIALS */}
        <Section title="ماذا يقول اللاعبون" subtitle="من مجتمع ArenaX" icon={Sparkles}>
          <div className="grid md:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="glass p-6 relative overflow-hidden group hover:border-primary/50 transition-all duration-500">
                <div className="absolute -top-8 -end-8 h-24 w-24 rounded-full bg-primary/20 blur-3xl group-hover:bg-primary/30 transition-colors" />
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-11 w-11 rounded-full gradient-primary grid place-items-center font-bold text-primary-foreground">{t.name.slice(0, 1)}</div>
                  <div>
                    <div className="font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </div>
                <div className="flex gap-0.5 mb-2">{Array.from({ length: 5 }).map((_, k) => <Star key={k} className="h-3.5 w-3.5 fill-warning text-warning" />)}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* FINAL CTA */}
        <section className="relative overflow-hidden rounded-3xl">
          <div className="absolute inset-0 gradient-primary opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-tr from-background/60 via-transparent to-transparent" />
          <div className="absolute -top-20 -start-20 h-72 w-72 rounded-full bg-accent/40 blur-3xl animate-float-slow" />
          <div className="absolute -bottom-20 -end-20 h-72 w-72 rounded-full bg-neon/40 blur-3xl animate-float-alt" />
          <div className="relative px-6 py-14 md:py-20 text-center">
            <Rocket className="h-10 w-10 mx-auto text-white mb-4" />
            <h2 className="font-display text-3xl md:text-5xl font-black text-white text-glow">جاهز لتصبح أسطورة؟</h2>
            <p className="mt-4 text-white/90 max-w-xl mx-auto">سجّل الآن، اشحن محفظتك، وابدأ أول تحدي خلال دقائق.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/auth"><Button size="lg" className="bg-white text-primary hover:bg-white/90 h-12 px-8 text-base font-bold">أنشئ حسابك الآن <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" /></Button></Link>
              <Link to="/tournaments"><Button size="lg" variant="outline" className="border-white/40 text-white bg-white/10 hover:bg-white/20 backdrop-blur h-12 px-8 text-base">تصفّح البطولات</Button></Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============ HERO ============ */
function Hero() {
  return (
    <section className="relative overflow-hidden min-h-[92vh] flex items-center">
      {/* Animated background */}
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute inset-0 opacity-[0.15]" style={{
        backgroundImage: "linear-gradient(oklch(0.65 0.24 295 / 0.3) 1px, transparent 1px), linear-gradient(90deg, oklch(0.65 0.24 295 / 0.3) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
        maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
      }} />
      {/* Orbs */}
      <div className="absolute top-1/4 -start-32 h-96 w-96 rounded-full bg-primary/40 blur-3xl animate-float-slow" />
      <div className="absolute bottom-1/4 -end-32 h-[28rem] w-[28rem] rounded-full bg-accent/35 blur-3xl animate-float-alt" />
      <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-neon/25 blur-3xl animate-float-slow" style={{ animationDelay: "-6s" }} />

      <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28 text-center w-full">
        <img
          src={logoAsset.url}
          alt="ArenaX"
          width={128}
          height={128}
          className="mx-auto h-24 w-24 md:h-32 md:w-32 mb-6 drop-shadow-[0_0_40px_oklch(0.65_0.24_295_/_0.7)] animate-float-slow"
        />
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 backdrop-blur px-4 py-1.5 text-xs text-primary mb-8 animate-fade-in">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <Zap className="h-3.5 w-3.5" /> منصة الألعاب التنافسية رقم 1 في المغرب
        </div>


        <h1 className="font-display font-black leading-[0.95] tracking-tight">
          <span className="block text-4xl md:text-7xl lg:text-8xl opacity-0 animate-fade-in" style={{ animationDelay: "0.1s", animationFillMode: "forwards" }}>نافس.</span>
          <span className="block text-5xl md:text-8xl lg:text-9xl text-gradient-primary text-glow my-1 md:my-2 opacity-0 animate-fade-in" style={{ animationDelay: "0.3s", animationFillMode: "forwards" }}>اربح.</span>
          <span className="block text-4xl md:text-7xl lg:text-8xl opacity-0 animate-fade-in" style={{ animationDelay: "0.5s", animationFillMode: "forwards" }}>
            اصنع اسمك في <span className="text-accent text-glow">ArenaX</span>
          </span>
        </h1>

        <p className="mt-8 text-base md:text-xl text-muted-foreground max-w-2xl mx-auto opacity-0 animate-fade-in" style={{ animationDelay: "0.7s", animationFillMode: "forwards" }}>
          تحديات لاعب ضد لاعب · بطولات مباشرة · توقعات المباريات · جوائز مالية حقيقية بالدرهم المغربي.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 opacity-0 animate-fade-in" style={{ animationDelay: "0.9s", animationFillMode: "forwards" }}>
          <Link to="/auth">
            <Button size="lg" className="gradient-primary text-primary-foreground border-0 h-14 px-10 text-base font-bold rounded-xl animate-pulse-glow hover:scale-105 transition-transform">
              ابدأ الآن <ArrowRight className="ms-2 h-5 w-5 rtl:rotate-180" />
            </Button>
          </Link>
          <Link to="/tournaments">
            <Button size="lg" variant="outline" className="border-accent/50 text-accent bg-accent/5 hover:bg-accent/15 backdrop-blur h-14 px-10 text-base font-semibold rounded-xl">
              <Trophy className="me-2 h-5 w-5" /> استكشف البطولات
            </Button>
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs md:text-sm text-muted-foreground opacity-0 animate-fade-in" style={{ animationDelay: "1.1s", animationFillMode: "forwards" }}>
          <span className="inline-flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-red-400" /> بث مباشر</span>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-success" /> دفع فوري وآمن</span>
          <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> نزاعات محكّمة 24/7</span>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-b from-transparent to-background pointer-events-none" />
    </section>
  );
}

/* ============ STAT GLASS ============ */
function StatGlass({ icon: Icon, label, value, color, isCurrency }: {
  icon: any; label: string; value: number; color: "primary" | "accent" | "neon"; isCurrency?: boolean;
}) {
  const iconColor = color === "primary" ? "text-primary" : color === "accent" ? "text-accent" : "text-neon";
  const glowColor = color === "primary" ? "bg-primary/20" : color === "accent" ? "bg-accent/20" : "bg-neon/20";
  return (
    <div className="glass p-4 md:p-6 relative overflow-hidden group hover:-translate-y-1 transition-all duration-500">
      <div className={`absolute -top-8 -end-8 h-24 w-24 rounded-full ${glowColor} blur-2xl group-hover:scale-125 transition-transform duration-700`} />
      <Icon className={`h-7 w-7 md:h-8 md:w-8 ${iconColor} mb-3 relative`} />
      <div className="text-2xl md:text-4xl font-display font-black leading-none">
        <AnimatedCounter to={value} />
      </div>
      <div className="text-[11px] md:text-xs text-muted-foreground mt-2 font-medium uppercase tracking-wider">{label}{isCurrency ? "" : ""}</div>
    </div>
  );
}

function AnimatedCounter({ to }: { to: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const dur = 1400, start = performance.now();
        const step = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(Math.floor(to * eased));
          if (p < 1) requestAnimationFrame(step);
          else setN(to);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [to]);
  return <span ref={ref}>{n.toLocaleString("ar-MA")}</span>;
}

/* ============ WINNERS MARQUEE ============ */
function WinnersMarquee({ winners }: { winners: any[] }) {
  const doubled = [...winners, ...winners];
  return (
    <section className="relative">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-warning" />
        <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">آخر الفائزين</span>
      </div>
      <div className="relative overflow-hidden glass py-4 [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="flex gap-3 w-max animate-marquee">
          {doubled.map((w, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2 rounded-full bg-background/50 border border-primary/30 shrink-0">
              <div className="h-8 w-8 rounded-full overflow-hidden bg-muted grid place-items-center shrink-0">
                {w.profiles?.avatar_url ? <img src={w.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                  : <Trophy className="h-4 w-4 text-warning" />}
              </div>
              <div className="text-sm">
                <span className="font-bold">{w.profiles?.display_name ?? w.profiles?.username ?? "لاعب"}</span>
                <span className="text-muted-foreground mx-1">·</span>
                <span className="text-neon font-bold text-glow">{w.title}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ============ SECTION WRAPPER ============ */
function Section({ title, subtitle, icon: Icon, link, children, liveBadge }: {
  title: string; subtitle?: string; icon: any; link?: string; children: ReactNode; liveBadge?: boolean;
}) {
  return (
    <section>
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-2xl md:text-3xl font-black flex items-center gap-2">
              <Icon className="h-6 w-6 md:h-7 md:w-7 text-primary" /> {title}
            </h2>
            {liveBadge && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/40 font-semibold uppercase flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> Live
              </span>
            )}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        {link && (
          <Link to={link as any} className="text-sm text-primary hover:text-accent transition-colors flex items-center gap-1 group whitespace-nowrap">
            عرض الكل <ArrowRight className="h-4 w-4 rtl:rotate-180 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-transform" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function TeamMini({ name, logo, reverse }: { name: string; logo: string | null; reverse?: boolean }) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${reverse ? "flex-row-reverse text-left" : ""}`}>
      <div className="h-10 w-10 rounded-full bg-muted grid place-items-center overflow-hidden shrink-0 border border-border">
        {logo ? <img src={logo} alt={name} className="h-full w-full object-cover" />
          : <span className="text-[10px] font-bold text-muted-foreground">{name.slice(0, 2)}</span>}
      </div>
      <div className="min-w-0"><div className="font-semibold text-sm truncate">{name}</div></div>
    </div>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return <div className="glass-soft p-8 text-center text-muted-foreground text-sm col-span-full">{children}</div>;
}

const TESTIMONIALS = [
  { name: "يوسف الإدريسي", role: "لاعب محترف · FC 25", text: "ربحت أول 500 د.م في يومي الأول. النظام سريع، الدفع فوري، والدعم متجاوب جداً." },
  { name: "سارة بنعلي", role: "بطلة PUBG Mobile", text: "المستوى التنافسي عالي جداً. أخيراً منصة مغربية بمستوى عالمي، مع بطولات منظمة وجوائز حقيقية." },
  { name: "مهدي العلوي", role: "منشئ محتوى · Valorant", text: "ArenaX غيّرت طريقة لعبنا. المخططات والنزاعات كلها شفافة، والمجتمع محترم." },
];
