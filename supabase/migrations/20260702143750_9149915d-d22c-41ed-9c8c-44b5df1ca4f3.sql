
-- Enums
DO $$ BEGIN CREATE TYPE public.match_kind AS ENUM ('sport','esport'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.match_status AS ENUM ('scheduled','live','finished','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.market_status AS ENUM ('open','closed','settled','cancelled','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- matches
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.match_kind NOT NULL,
  sport text NOT NULL,
  tournament text,
  team1_name text NOT NULL,
  team1_logo text,
  team2_name text NOT NULL,
  team2_logo text,
  start_time timestamptz NOT NULL,
  status public.match_status NOT NULL DEFAULT 'scheduled',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "matches_read_all" ON public.matches FOR SELECT USING (true);
CREATE TRIGGER matches_updated_at BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS matches_status_start_idx ON public.matches(status, start_time DESC);
CREATE INDEX IF NOT EXISTS matches_kind_idx ON public.matches(kind);

-- match_markets
CREATE TABLE IF NOT EXISTS public.match_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  title text NOT NULL,
  market_type text NOT NULL DEFAULT 'custom',
  entry_fee numeric NOT NULL CHECK (entry_fee >= 0),
  commission_pct numeric NOT NULL DEFAULT 10 CHECK (commission_pct >= 0 AND commission_pct <= 50),
  status public.market_status NOT NULL DEFAULT 'open',
  closes_at timestamptz NOT NULL,
  winning_option_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.match_markets TO anon, authenticated;
GRANT ALL ON public.match_markets TO service_role;
ALTER TABLE public.match_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "markets_read_all" ON public.match_markets FOR SELECT USING (true);
CREATE TRIGGER match_markets_updated_at BEFORE UPDATE ON public.match_markets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS markets_match_idx ON public.match_markets(match_id);
CREATE INDEX IF NOT EXISTS markets_status_idx ON public.match_markets(status);

-- market_options
CREATE TABLE IF NOT EXISTS public.market_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.match_markets(id) ON DELETE CASCADE,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_options TO anon, authenticated;
GRANT ALL ON public.market_options TO service_role;
ALTER TABLE public.market_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "options_read_all" ON public.market_options FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS options_market_idx ON public.market_options(market_id, sort_order);

-- market_entries
CREATE TABLE IF NOT EXISTS public.market_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.match_markets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.market_options(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  is_winner boolean,
  payout numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market_id, user_id)
);
GRANT SELECT ON public.market_entries TO authenticated;
GRANT ALL ON public.market_entries TO service_role;
ALTER TABLE public.market_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entries_owner_read" ON public.market_entries FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS entries_market_idx ON public.market_entries(market_id);
CREATE INDEX IF NOT EXISTS entries_user_idx ON public.market_entries(user_id, created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_markets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.market_entries;

-- ============ RPCs ============

-- Admin: create match
CREATE OR REPLACE FUNCTION public.admin_create_match(
  _kind public.match_kind, _sport text, _tournament text,
  _team1_name text, _team1_logo text, _team2_name text, _team2_logo text,
  _start_time timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); mid uuid;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.matches(kind, sport, tournament, team1_name, team1_logo, team2_name, team2_logo, start_time, created_by)
  VALUES (_kind, _sport, NULLIF(_tournament,''), _team1_name, NULLIF(_team1_logo,''), _team2_name, NULLIF(_team2_logo,''), _start_time, uid)
  RETURNING id INTO mid;
  PERFORM public._audit(uid, 'match.create', 'match', mid, jsonb_build_object('kind', _kind, 'sport', _sport));
  RETURN mid;
END $$;

-- Admin: update match
CREATE OR REPLACE FUNCTION public.admin_update_match(
  _match_id uuid, _sport text, _tournament text,
  _team1_name text, _team1_logo text, _team2_name text, _team2_logo text,
  _start_time timestamptz, _status public.match_status
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.matches SET
    sport = _sport, tournament = NULLIF(_tournament,''),
    team1_name = _team1_name, team1_logo = NULLIF(_team1_logo,''),
    team2_name = _team2_name, team2_logo = NULLIF(_team2_logo,''),
    start_time = _start_time, status = _status, updated_at = now()
  WHERE id = _match_id;
  PERFORM public._audit(uid, 'match.update', 'match', _match_id, '{}'::jsonb);
END $$;

-- Admin: delete match
CREATE OR REPLACE FUNCTION public.admin_delete_match(_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.market_entries e JOIN public.match_markets m ON m.id = e.market_id WHERE m.match_id = _match_id) THEN
    RAISE EXCEPTION 'match_has_entries';
  END IF;
  DELETE FROM public.matches WHERE id = _match_id;
  PERFORM public._audit(uid, 'match.delete', 'match', _match_id, '{}'::jsonb);
END $$;

-- Admin: create market with options
CREATE OR REPLACE FUNCTION public.admin_create_market(
  _match_id uuid, _title text, _market_type text,
  _entry_fee numeric, _commission_pct numeric, _closes_at timestamptz,
  _options text[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); mkid uuid; i int;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _entry_fee < 0 THEN RAISE EXCEPTION 'invalid_entry_fee'; END IF;
  IF array_length(_options, 1) IS NULL OR array_length(_options, 1) < 2 THEN RAISE EXCEPTION 'need_min_two_options'; END IF;
  INSERT INTO public.match_markets(match_id, title, market_type, entry_fee, commission_pct, closes_at)
    VALUES (_match_id, _title, COALESCE(NULLIF(_market_type,''),'custom'), _entry_fee, COALESCE(_commission_pct,10), _closes_at)
    RETURNING id INTO mkid;
  FOR i IN 1..array_length(_options,1) LOOP
    INSERT INTO public.market_options(market_id, label, sort_order) VALUES (mkid, _options[i], i);
  END LOOP;
  PERFORM public._audit(uid, 'market.create', 'market', mkid, jsonb_build_object('match_id', _match_id));
  RETURN mkid;
END $$;

-- Admin: update market
CREATE OR REPLACE FUNCTION public.admin_update_market(
  _market_id uuid, _title text, _market_type text,
  _entry_fee numeric, _commission_pct numeric, _closes_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.market_entries WHERE market_id = _market_id) THEN
    UPDATE public.match_markets SET title = _title, market_type = _market_type, closes_at = _closes_at, updated_at = now() WHERE id = _market_id;
  ELSE
    UPDATE public.match_markets SET title = _title, market_type = _market_type, entry_fee = _entry_fee, commission_pct = _commission_pct, closes_at = _closes_at, updated_at = now() WHERE id = _market_id;
  END IF;
  PERFORM public._audit(uid, 'market.update', 'market', _market_id, '{}'::jsonb);
END $$;

-- Admin: delete market
CREATE OR REPLACE FUNCTION public.admin_delete_market(_market_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.market_entries WHERE market_id = _market_id) THEN RAISE EXCEPTION 'market_has_entries'; END IF;
  DELETE FROM public.match_markets WHERE id = _market_id;
  PERFORM public._audit(uid, 'market.delete', 'market', _market_id, '{}'::jsonb);
END $$;

-- Admin: close / reopen market
CREATE OR REPLACE FUNCTION public.admin_set_market_status(_market_id uuid, _status public.market_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _status NOT IN ('open','closed') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  UPDATE public.match_markets SET status = _status, updated_at = now()
    WHERE id = _market_id AND status IN ('open','closed');
  PERFORM public._audit(uid, 'market.set_status', 'market', _market_id, jsonb_build_object('status', _status));
END $$;

-- User: place prediction
CREATE OR REPLACE FUNCTION public.place_prediction(_market_id uuid, _option_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); mk public.match_markets; opt public.market_options; eid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO mk FROM public.match_markets WHERE id = _market_id FOR UPDATE;
  IF mk IS NULL THEN RAISE EXCEPTION 'market_not_found'; END IF;
  IF mk.status <> 'open' THEN RAISE EXCEPTION 'market_not_open'; END IF;
  IF mk.closes_at <= now() THEN RAISE EXCEPTION 'market_closed'; END IF;
  SELECT * INTO opt FROM public.market_options WHERE id = _option_id AND market_id = _market_id;
  IF opt IS NULL THEN RAISE EXCEPTION 'invalid_option'; END IF;
  IF EXISTS (SELECT 1 FROM public.market_entries WHERE market_id = _market_id AND user_id = uid) THEN
    RAISE EXCEPTION 'already_participated';
  END IF;
  IF mk.entry_fee > 0 THEN
    PERFORM public._wallet_change(uid, -mk.entry_fee, 0, 'prediction_entry', mk.entry_fee, _market_id, 'مشاركة في سوق توقعات');
  END IF;
  INSERT INTO public.market_entries(market_id, user_id, option_id, amount)
    VALUES (_market_id, uid, _option_id, mk.entry_fee) RETURNING id INTO eid;
  PERFORM public._audit(uid, 'prediction.place', 'market', _market_id, jsonb_build_object('option_id', _option_id));
  RETURN eid;
END $$;

-- Admin: settle market
CREATE OR REPLACE FUNCTION public.admin_settle_market(_market_id uuid, _winning_option_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); mk public.match_markets;
  pool numeric; commission numeric; net numeric;
  winners_count int; per_winner numeric; e record;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO mk FROM public.match_markets WHERE id = _market_id FOR UPDATE;
  IF mk IS NULL THEN RAISE EXCEPTION 'market_not_found'; END IF;
  IF mk.status IN ('settled','refunded','cancelled') THEN RAISE EXCEPTION 'already_settled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.market_options WHERE id = _winning_option_id AND market_id = _market_id) THEN
    RAISE EXCEPTION 'invalid_option';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO pool FROM public.market_entries WHERE market_id = _market_id;
  SELECT COUNT(*) INTO winners_count FROM public.market_entries WHERE market_id = _market_id AND option_id = _winning_option_id;

  IF winners_count = 0 THEN
    -- Refund all
    FOR e IN SELECT * FROM public.market_entries WHERE market_id = _market_id LOOP
      IF e.amount > 0 THEN
        PERFORM public._wallet_change(e.user_id, e.amount, 0, 'refund', e.amount, _market_id, 'استرداد سوق توقعات (لا يوجد فائزون)');
      END IF;
      UPDATE public.market_entries SET is_winner = false, payout = e.amount WHERE id = e.id;
      PERFORM public._notify(e.user_id, 'استرداد توقع', 'تم استرداد رسوم توقعك.', 'prediction', '/predictions');
    END LOOP;
    UPDATE public.match_markets SET status = 'refunded', winning_option_id = _winning_option_id, updated_at = now() WHERE id = _market_id;
  ELSE
    commission := ROUND(pool * mk.commission_pct / 100.0, 2);
    net := pool - commission;
    per_winner := ROUND(net / winners_count, 2);
    FOR e IN SELECT * FROM public.market_entries WHERE market_id = _market_id LOOP
      IF e.option_id = _winning_option_id THEN
        IF per_winner > 0 THEN
          PERFORM public._wallet_change(e.user_id, per_winner, 0, 'prediction_win', per_winner, _market_id, 'ربح توقع');
        END IF;
        UPDATE public.market_entries SET is_winner = true, payout = per_winner WHERE id = e.id;
        UPDATE public.profiles SET xp = xp + 25 WHERE id = e.user_id;
        PERFORM public._notify(e.user_id, 'ربحت توقعك!', 'تمت إضافة ' || per_winner || ' د.م إلى محفظتك.', 'prediction', '/predictions');
        INSERT INTO public.activity_feed(user_id, type, title, body, meta)
          VALUES (e.user_id, 'prediction_win', 'ربح توقع بـ ' || per_winner || ' د.م', mk.title, jsonb_build_object('market_id', _market_id));
      ELSE
        UPDATE public.market_entries SET is_winner = false, payout = 0 WHERE id = e.id;
        PERFORM public._notify(e.user_id, 'انتهى السوق', 'حظاً أوفر في المرة القادمة.', 'prediction', '/predictions');
      END IF;
    END LOOP;
    UPDATE public.match_markets SET status = 'settled', winning_option_id = _winning_option_id, updated_at = now() WHERE id = _market_id;
  END IF;
  PERFORM public._audit(uid, 'market.settle', 'market', _market_id, jsonb_build_object('winning_option', _winning_option_id, 'pool', pool, 'winners', winners_count));
END $$;
