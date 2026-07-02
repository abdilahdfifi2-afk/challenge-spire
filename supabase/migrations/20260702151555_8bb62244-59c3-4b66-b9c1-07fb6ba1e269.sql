
-- 1. Add stake range columns
ALTER TABLE public.match_markets
  ADD COLUMN IF NOT EXISTS min_stake numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_stake numeric NOT NULL DEFAULT 1000;

-- Backfill from existing entry_fee where present
UPDATE public.match_markets
   SET min_stake = GREATEST(COALESCE(entry_fee,10), 5),
       max_stake = GREATEST(COALESCE(entry_fee,10) * 50, 1000)
 WHERE min_stake = 10;

-- 2. place_prediction with user-chosen stake
DROP FUNCTION IF EXISTS public.place_prediction(uuid, uuid);
DROP FUNCTION IF EXISTS public.place_prediction(uuid, uuid, numeric);
CREATE OR REPLACE FUNCTION public.place_prediction(_market_id uuid, _option_id uuid, _stake numeric)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); mk public.match_markets; opt public.market_options; eid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _stake IS NULL OR _stake <= 0 THEN RAISE EXCEPTION 'invalid_stake'; END IF;
  SELECT * INTO mk FROM public.match_markets WHERE id = _market_id FOR UPDATE;
  IF mk IS NULL THEN RAISE EXCEPTION 'market_not_found'; END IF;
  IF mk.status <> 'open' THEN RAISE EXCEPTION 'market_not_open'; END IF;
  IF mk.closes_at <= now() THEN RAISE EXCEPTION 'market_closed'; END IF;
  IF _stake < mk.min_stake OR _stake > mk.max_stake THEN RAISE EXCEPTION 'stake_out_of_range'; END IF;
  SELECT * INTO opt FROM public.market_options WHERE id = _option_id AND market_id = _market_id;
  IF opt IS NULL THEN RAISE EXCEPTION 'invalid_option'; END IF;
  IF EXISTS (SELECT 1 FROM public.market_entries WHERE market_id = _market_id AND user_id = uid) THEN
    RAISE EXCEPTION 'already_participated';
  END IF;
  PERFORM public._wallet_change(uid, -_stake, 0, 'prediction_entry', _stake, _market_id, 'رهان توقعات');
  INSERT INTO public.market_entries(market_id, user_id, option_id, amount)
    VALUES (_market_id, uid, _option_id, _stake) RETURNING id INTO eid;
  PERFORM public._audit(uid, 'prediction.place', 'market', _market_id, jsonb_build_object('option_id', _option_id, 'stake', _stake));
  RETURN eid;
END $$;

-- 3. Settlement — proportional payout by stake
CREATE OR REPLACE FUNCTION public.admin_settle_market(_market_id uuid, _winning_option_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid(); mk public.match_markets;
  pool numeric; commission numeric; net numeric;
  winners_stake numeric; per_unit numeric; e record; payout numeric;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO mk FROM public.match_markets WHERE id = _market_id FOR UPDATE;
  IF mk IS NULL THEN RAISE EXCEPTION 'market_not_found'; END IF;
  IF mk.status IN ('settled','refunded','cancelled') THEN RAISE EXCEPTION 'already_settled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.market_options WHERE id = _winning_option_id AND market_id = _market_id) THEN
    RAISE EXCEPTION 'invalid_option';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO pool FROM public.market_entries WHERE market_id = _market_id;
  SELECT COALESCE(SUM(amount),0) INTO winners_stake FROM public.market_entries WHERE market_id = _market_id AND option_id = _winning_option_id;

  IF winners_stake = 0 THEN
    -- No winners → full refund
    FOR e IN SELECT * FROM public.market_entries WHERE market_id = _market_id LOOP
      PERFORM public._wallet_change(e.user_id, e.amount, 0, 'refund', e.amount, _market_id, 'استرداد سوق توقعات (لا يوجد فائزون)');
      UPDATE public.market_entries SET is_winner = false, payout = e.amount WHERE id = e.id;
      PERFORM public._notify(e.user_id, 'استرداد توقع', 'تم استرداد رهانك.', 'prediction', '/predictions');
    END LOOP;
    UPDATE public.match_markets SET status = 'refunded', winning_option_id = _winning_option_id, updated_at = now() WHERE id = _market_id;
  ELSE
    commission := ROUND(pool * mk.commission_pct / 100.0, 2);
    net := pool - commission;
    per_unit := net / winners_stake; -- payout per 1 unit stake
    FOR e IN SELECT * FROM public.market_entries WHERE market_id = _market_id LOOP
      IF e.option_id = _winning_option_id THEN
        payout := ROUND(e.amount * per_unit, 2);
        IF payout > 0 THEN
          PERFORM public._wallet_change(e.user_id, payout, 0, 'prediction_win', payout, _market_id, 'ربح رهان توقعات');
        END IF;
        UPDATE public.market_entries SET is_winner = true, payout = payout WHERE id = e.id;
        UPDATE public.profiles SET xp = xp + 25 WHERE id = e.user_id;
        PERFORM public._notify(e.user_id, 'ربحت توقعك!', 'تمت إضافة ' || payout || ' د.م إلى محفظتك.', 'prediction', '/predictions');
        INSERT INTO public.activity_feed(user_id, type, title, body, meta)
          VALUES (e.user_id, 'prediction_win', 'ربح توقع بـ ' || payout || ' د.م', mk.title, jsonb_build_object('market_id', _market_id));
      ELSE
        UPDATE public.market_entries SET is_winner = false, payout = 0 WHERE id = e.id;
        PERFORM public._notify(e.user_id, 'خسر رهانك', 'حظاً أوفر في المرة القادمة.', 'prediction', '/predictions');
      END IF;
    END LOOP;
    UPDATE public.match_markets SET status = 'settled', winning_option_id = _winning_option_id, updated_at = now() WHERE id = _market_id;
  END IF;
  PERFORM public._audit(uid, 'market.settle', 'market', _market_id, jsonb_build_object('winning_option', _winning_option_id, 'pool', pool, 'winners_stake', winners_stake));
END $$;

-- 4. Void market (draw / cancelled → refund everyone)
CREATE OR REPLACE FUNCTION public.admin_void_market(_market_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); mk public.match_markets; e record;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO mk FROM public.match_markets WHERE id = _market_id FOR UPDATE;
  IF mk IS NULL THEN RAISE EXCEPTION 'market_not_found'; END IF;
  IF mk.status IN ('settled','refunded','cancelled') THEN RAISE EXCEPTION 'already_settled'; END IF;
  FOR e IN SELECT * FROM public.market_entries WHERE market_id = _market_id LOOP
    PERFORM public._wallet_change(e.user_id, e.amount, 0, 'refund', e.amount, _market_id, COALESCE(_reason,'استرداد رهان — سوق ملغى/تعادل'));
    UPDATE public.market_entries SET is_winner = false, payout = e.amount WHERE id = e.id;
    PERFORM public._notify(e.user_id, 'استرداد رهان', COALESCE(_reason,'تم إلغاء السوق — رُدّ المبلغ.'), 'prediction', '/predictions');
  END LOOP;
  UPDATE public.match_markets SET status = 'refunded', updated_at = now() WHERE id = _market_id;
  PERFORM public._audit(uid, 'market.void', 'market', _market_id, jsonb_build_object('reason', _reason));
END $$;

-- 5. admin_create_market / admin_update_market with stake range
DROP FUNCTION IF EXISTS public.admin_create_market(uuid, text, text, numeric, numeric, timestamptz, text[]);
CREATE OR REPLACE FUNCTION public.admin_create_market(
  _match_id uuid, _title text, _market_type text,
  _min_stake numeric, _max_stake numeric, _commission_pct numeric,
  _closes_at timestamptz, _options text[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); mkid uuid; i int;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _min_stake IS NULL OR _min_stake <= 0 THEN RAISE EXCEPTION 'invalid_min_stake'; END IF;
  IF _max_stake IS NULL OR _max_stake < _min_stake THEN RAISE EXCEPTION 'invalid_max_stake'; END IF;
  IF array_length(_options, 1) IS NULL OR array_length(_options, 1) < 2 THEN RAISE EXCEPTION 'need_min_two_options'; END IF;
  INSERT INTO public.match_markets(match_id, title, market_type, entry_fee, min_stake, max_stake, commission_pct, closes_at)
    VALUES (_match_id, _title, COALESCE(NULLIF(_market_type,''),'custom'), _min_stake, _min_stake, _max_stake, COALESCE(_commission_pct,10), _closes_at)
    RETURNING id INTO mkid;
  FOR i IN 1..array_length(_options,1) LOOP
    INSERT INTO public.market_options(market_id, label, sort_order) VALUES (mkid, _options[i], i);
  END LOOP;
  PERFORM public._audit(uid, 'market.create', 'market', mkid, jsonb_build_object('match_id', _match_id));
  RETURN mkid;
END $$;

DROP FUNCTION IF EXISTS public.admin_update_market(uuid, text, text, numeric, numeric, timestamptz);
CREATE OR REPLACE FUNCTION public.admin_update_market(
  _market_id uuid, _title text, _market_type text,
  _min_stake numeric, _max_stake numeric, _commission_pct numeric, _closes_at timestamptz
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF EXISTS (SELECT 1 FROM public.market_entries WHERE market_id = _market_id) THEN
    UPDATE public.match_markets SET title = _title, market_type = _market_type, closes_at = _closes_at, updated_at = now() WHERE id = _market_id;
  ELSE
    UPDATE public.match_markets SET title = _title, market_type = _market_type,
      min_stake = _min_stake, max_stake = _max_stake, entry_fee = _min_stake,
      commission_pct = _commission_pct, closes_at = _closes_at, updated_at = now() WHERE id = _market_id;
  END IF;
  PERFORM public._audit(uid, 'market.update', 'market', _market_id, '{}'::jsonb);
END $$;

-- Widen stake range for existing sample markets so users can test
UPDATE public.match_markets SET min_stake = 10, max_stake = 5000 WHERE min_stake >= 5;
