
-- ============ FRIENDSHIPS ============
CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(requester_id, addressee_id),
  CHECK (requester_id <> addressee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.friendships TO authenticated;
GRANT ALL ON public.friendships TO service_role;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view own friendships" ON public.friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "admin all friendships" ON public.friendships FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ ACHIEVEMENTS ============
CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  xp_reward INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievements TO anon, authenticated;
GRANT ALL ON public.achievements TO service_role;
ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read achievements" ON public.achievements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage achievements" ON public.achievements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, achievement_id)
);
GRANT SELECT ON public.user_achievements TO anon, authenticated;
GRANT ALL ON public.user_achievements TO service_role;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read user achievements" ON public.user_achievements FOR SELECT TO anon, authenticated USING (true);

-- ============ ACTIVITY FEED ============
CREATE TABLE IF NOT EXISTS public.activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.activity_feed TO anon, authenticated;
GRANT ALL ON public.activity_feed TO service_role;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read activity" ON public.activity_feed FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS activity_feed_created_idx ON public.activity_feed(created_at DESC);
CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON public.user_achievements(user_id);

-- ============ SEED ACHIEVEMENTS ============
INSERT INTO public.achievements (code, title, description, icon, xp_reward) VALUES
  ('first_win','الفوز الأول','فز بأول تحدي لك','trophy',50),
  ('five_wins','خماسي الانتصارات','فز بـ 5 تحديات','medal',100),
  ('ten_wins','بطل صاعد','فز بـ 10 تحديات','crown',250),
  ('fifty_wins','أسطورة','فز بـ 50 تحدياً','sparkles',1000),
  ('tournament_champion','بطل بطولة','فز بأول بطولة','trophy',500),
  ('first_deposit','ممول','قم بأول إيداع','wallet',20)
ON CONFLICT (code) DO NOTHING;

-- ============ HELPERS ============
CREATE OR REPLACE FUNCTION public._grant_achievement(_user UUID, _code TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.achievements;
BEGIN
  SELECT * INTO a FROM public.achievements WHERE code = _code;
  IF a.id IS NULL THEN RETURN; END IF;
  INSERT INTO public.user_achievements(user_id, achievement_id) VALUES (_user, a.id)
    ON CONFLICT DO NOTHING;
  IF FOUND THEN
    UPDATE public.profiles SET xp = xp + a.xp_reward WHERE id = _user;
    INSERT INTO public.notifications(user_id, title, body, type, link)
      VALUES (_user, 'إنجاز جديد: ' || a.title, COALESCE(a.description,''), 'achievement', '/achievements');
    INSERT INTO public.activity_feed(user_id, type, title, body, meta)
      VALUES (_user, 'achievement', 'حصل على إنجاز: ' || a.title, a.description, jsonb_build_object('code', a.code));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public._check_win_achievements(_user UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w INTEGER;
BEGIN
  SELECT wins INTO w FROM public.profiles WHERE id = _user;
  IF w >= 1 THEN PERFORM public._grant_achievement(_user, 'first_win'); END IF;
  IF w >= 5 THEN PERFORM public._grant_achievement(_user, 'five_wins'); END IF;
  IF w >= 10 THEN PERFORM public._grant_achievement(_user, 'ten_wins'); END IF;
  IF w >= 50 THEN PERFORM public._grant_achievement(_user, 'fifty_wins'); END IF;
END $$;

-- ============ FRIEND RPCs ============
CREATE OR REPLACE FUNCTION public.send_friend_request(_username TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid UUID := auth.uid(); target UUID; fid UUID; existing public.friendships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT id INTO target FROM public.profiles WHERE username = _username OR display_name = _username LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF target = uid THEN RAISE EXCEPTION 'cannot_friend_self'; END IF;
  SELECT * INTO existing FROM public.friendships
    WHERE (requester_id = uid AND addressee_id = target) OR (requester_id = target AND addressee_id = uid);
  IF existing.id IS NOT NULL THEN RAISE EXCEPTION 'friendship_exists'; END IF;
  INSERT INTO public.friendships(requester_id, addressee_id, status) VALUES (uid, target, 'pending') RETURNING id INTO fid;
  PERFORM public._notify(target, 'طلب صداقة جديد', 'أرسل لك لاعب طلب صداقة', 'friend', '/friends');
  RETURN fid;
END $$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(_fid UUID, _accept BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid UUID := auth.uid(); f public.friendships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO f FROM public.friendships WHERE id = _fid FOR UPDATE;
  IF f IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF f.addressee_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF f.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  UPDATE public.friendships SET status = CASE WHEN _accept THEN 'accepted' ELSE 'rejected' END, updated_at = now() WHERE id = _fid;
  IF _accept THEN
    PERFORM public._notify(f.requester_id, 'تم قبول صداقتك', 'أصبحتما صديقين', 'friend', '/friends');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.remove_friend(_fid UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid UUID := auth.uid(); f public.friendships;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO f FROM public.friendships WHERE id = _fid;
  IF f IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF uid NOT IN (f.requester_id, f.addressee_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.friendships WHERE id = _fid;
END $$;

-- ============ HOOK INTO SETTLEMENT ============
CREATE OR REPLACE FUNCTION public._settle_challenge(_c challenges, _winner uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE loser UUID; s public.platform_settings; commission NUMERIC;
BEGIN
  IF _winner NOT IN (_c.creator_id, _c.opponent_id) THEN RAISE EXCEPTION 'invalid_winner'; END IF;
  loser := CASE WHEN _winner = _c.creator_id THEN _c.opponent_id ELSE _c.creator_id END;
  SELECT * INTO s FROM public.platform_settings WHERE id = true;
  commission := ROUND((2 * _c.entry_fee) * (s.commission_pct/100), 2);
  PERFORM public._wallet_change(loser, -_c.entry_fee, -_c.entry_fee, 'challenge_entry', _c.entry_fee, _c.id, 'خسارة رسوم تحدي');
  PERFORM public._wallet_change(_winner, -_c.entry_fee, -_c.entry_fee, 'refund', _c.entry_fee, _c.id, 'استرداد الحجز');
  PERFORM public._wallet_change(_winner, _c.prize, 0, 'challenge_win', _c.prize, _c.id, 'ربح تحدي');
  UPDATE public.challenges SET status = 'completed', updated_at = now() WHERE id = _c.id;
  UPDATE public.profiles SET wins = wins + 1, xp = xp + 50 WHERE id = _winner;
  UPDATE public.profiles SET losses = losses + 1, xp = xp + 10 WHERE id = loser;
  PERFORM public._notify(_winner, 'ربحت التحدي!', 'تمت إضافة الجائزة إلى محفظتك.', 'challenge', '/challenges/' || _c.id::text);
  PERFORM public._notify(loser, 'انتهى التحدي', 'حظاً أوفر في المرة القادمة.', 'challenge', '/challenges/' || _c.id::text);
  INSERT INTO public.activity_feed(user_id, type, title, body, meta)
    VALUES (_winner, 'challenge_win', 'فاز بتحدي وربح ' || _c.prize || ' د.م', _c.title, jsonb_build_object('challenge_id', _c.id));
  PERFORM public._check_win_achievements(_winner);
  PERFORM public._audit(_winner, 'challenge.settle', 'challenge', _c.id, jsonb_build_object('winner', _winner, 'loser', loser, 'commission', commission));
END $$;
