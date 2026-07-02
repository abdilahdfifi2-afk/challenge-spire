
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (commission_pct >= 0 AND commission_pct <= 50),
  min_deposit NUMERIC(14,2) NOT NULL DEFAULT 20,
  max_deposit NUMERIC(14,2) NOT NULL DEFAULT 50000,
  min_withdrawal NUMERIC(14,2) NOT NULL DEFAULT 50,
  max_withdrawal NUMERIC(14,2) NOT NULL DEFAULT 50000,
  min_challenge_fee NUMERIC(14,2) NOT NULL DEFAULT 5,
  max_challenge_fee NUMERIC(14,2) NOT NULL DEFAULT 10000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ps_read_all" ON public.platform_settings;
DROP POLICY IF EXISTS "ps_admin_write" ON public.platform_settings;
CREATE POLICY "ps_read_all" ON public.platform_settings FOR SELECT USING (true);
CREATE POLICY "ps_admin_write" ON public.platform_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.platform_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
DROP TRIGGER IF EXISTS trg_ps_updated ON public.platform_settings;
CREATE TRIGGER trg_ps_updated BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public._wallet_change(
  _user UUID, _balance_delta NUMERIC, _lock_delta NUMERIC,
  _tx_type tx_type, _amount NUMERIC, _ref UUID, _desc TEXT
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance NUMERIC; new_lock NUMERIC;
BEGIN
  UPDATE public.wallets
    SET balance = balance + _balance_delta,
        locked_balance = locked_balance + _lock_delta,
        updated_at = now()
    WHERE user_id = _user
    RETURNING balance, locked_balance INTO new_balance, new_lock;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'wallet_not_found'; END IF;
  IF new_balance < 0 OR new_lock < 0 OR (new_balance - new_lock) < 0 THEN
    RAISE EXCEPTION 'insufficient_funds';
  END IF;
  IF _tx_type IS NOT NULL AND _amount IS NOT NULL AND _amount <> 0 THEN
    INSERT INTO public.wallet_transactions(user_id, type, amount, status, reference_id, description, balance_after)
    VALUES (_user, _tx_type, _amount, 'completed', _ref, _desc, new_balance);
  END IF;
  RETURN new_balance;
END $$;
REVOKE ALL ON FUNCTION public._wallet_change(UUID, NUMERIC, NUMERIC, tx_type, NUMERIC, UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._audit(_actor UUID, _action TEXT, _entity TEXT, _entity_id UUID, _meta JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.audit_logs(actor_id, action, entity, entity_id, meta) VALUES (_actor, _action, _entity, _entity_id, _meta);
$$;
REVOKE ALL ON FUNCTION public._audit(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._notify(_user UUID, _title TEXT, _body TEXT, _type TEXT, _link TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, title, body, type, link) VALUES (_user, _title, _body, _type, _link);
$$;
REVOKE ALL ON FUNCTION public._notify(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

-- ==================== CHALLENGES ====================

CREATE OR REPLACE FUNCTION public.create_challenge_with_lock(
  _game_id UUID, _entry_fee NUMERIC, _title TEXT, _rules TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); s public.platform_settings; cid UUID; computed_prize NUMERIC;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _entry_fee IS NULL OR _entry_fee <= 0 THEN RAISE EXCEPTION 'invalid_entry_fee'; END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id = true;
  IF _entry_fee < s.min_challenge_fee OR _entry_fee > s.max_challenge_fee THEN
    RAISE EXCEPTION 'entry_fee_out_of_range';
  END IF;
  computed_prize := ROUND((2 * _entry_fee) * (1 - s.commission_pct/100), 2);
  INSERT INTO public.challenges(game_id, creator_id, entry_fee, prize, title, rules, status)
    VALUES (_game_id, uid, _entry_fee, computed_prize, NULLIF(_title,''), NULLIF(_rules,''), 'open')
    RETURNING id INTO cid;
  PERFORM public._wallet_change(uid, 0, _entry_fee, 'challenge_entry', _entry_fee, cid, 'حجز رسوم إنشاء تحدي');
  PERFORM public._audit(uid, 'challenge.create', 'challenge', cid, jsonb_build_object('entry_fee', _entry_fee, 'prize', computed_prize));
  RETURN cid;
END $$;
GRANT EXECUTE ON FUNCTION public.create_challenge_with_lock(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_challenge(_challenge_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); c public.challenges;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = _challenge_id FOR UPDATE;
  IF c IS NULL THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF c.status <> 'open' THEN RAISE EXCEPTION 'challenge_not_open'; END IF;
  IF c.creator_id = uid THEN RAISE EXCEPTION 'cannot_join_own_challenge'; END IF;
  IF c.opponent_id IS NOT NULL THEN RAISE EXCEPTION 'challenge_full'; END IF;
  PERFORM public._wallet_change(uid, 0, c.entry_fee, 'challenge_entry', c.entry_fee, c.id, 'حجز رسوم قبول تحدي');
  UPDATE public.challenges SET opponent_id = uid, status = 'in_progress', updated_at = now() WHERE id = c.id;
  PERFORM public._audit(uid, 'challenge.join', 'challenge', c.id, jsonb_build_object('entry_fee', c.entry_fee));
  PERFORM public._notify(c.creator_id, 'انضم لاعب لتحديك', 'قبل خصمك التحدي — استعد للمباراة', 'challenge', '/challenges/' || c.id::text);
END $$;
GRANT EXECUTE ON FUNCTION public.join_challenge(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_challenge(_challenge_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); c public.challenges;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = _challenge_id FOR UPDATE;
  IF c IS NULL THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF c.creator_id <> uid AND NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF c.status <> 'open' THEN RAISE EXCEPTION 'cannot_cancel'; END IF;
  PERFORM public._wallet_change(c.creator_id, 0, -c.entry_fee, 'refund', c.entry_fee, c.id, 'استرداد رسوم إلغاء تحدي');
  UPDATE public.challenges SET status = 'cancelled', updated_at = now() WHERE id = c.id;
  PERFORM public._audit(uid, 'challenge.cancel', 'challenge', c.id, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_challenge(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public._settle_challenge(_c public.challenges, _winner UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  PERFORM public._audit(_winner, 'challenge.settle', 'challenge', _c.id, jsonb_build_object('winner', _winner, 'loser', loser, 'commission', commission));
END $$;

CREATE OR REPLACE FUNCTION public.submit_challenge_result(_challenge_id UUID, _winner UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); c public.challenges; other_submission public.match_results;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = _challenge_id FOR UPDATE;
  IF c IS NULL THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF uid NOT IN (c.creator_id, c.opponent_id) THEN RAISE EXCEPTION 'not_participant'; END IF;
  IF c.status NOT IN ('in_progress', 'awaiting_confirmation') THEN RAISE EXCEPTION 'not_active'; END IF;
  IF _winner NOT IN (c.creator_id, c.opponent_id) THEN RAISE EXCEPTION 'invalid_winner'; END IF;
  IF EXISTS (SELECT 1 FROM public.match_results WHERE challenge_id = c.id AND submitted_by = uid) THEN
    RAISE EXCEPTION 'already_submitted';
  END IF;
  INSERT INTO public.match_results(challenge_id, submitted_by, claimed_winner, status)
    VALUES (c.id, uid, _winner, 'pending');
  SELECT * INTO other_submission FROM public.match_results
    WHERE challenge_id = c.id AND submitted_by <> uid ORDER BY created_at DESC LIMIT 1;
  IF other_submission.id IS NULL THEN
    UPDATE public.challenges SET status = 'awaiting_confirmation', updated_at = now() WHERE id = c.id;
    PERFORM public._notify(
      CASE WHEN uid = c.creator_id THEN c.opponent_id ELSE c.creator_id END,
      'خصمك قدّم نتيجة', 'قدّم نتيجتك للتأكيد أو افتح نزاعاً.',
      'challenge', '/challenges/' || c.id::text);
    RETURN 'awaiting_other';
  END IF;
  IF other_submission.claimed_winner = _winner THEN
    UPDATE public.match_results SET status = 'confirmed' WHERE challenge_id = c.id;
    PERFORM public._settle_challenge(c, _winner);
    RETURN 'settled';
  ELSE
    UPDATE public.match_results SET status = 'disputed' WHERE challenge_id = c.id;
    UPDATE public.challenges SET status = 'disputed', updated_at = now() WHERE id = c.id;
    INSERT INTO public.disputes(challenge_id, opened_by, status, reason)
      VALUES (c.id, uid, 'open', 'اختلاف في الفائز — بحاجة لمراجعة الأدمن');
    PERFORM public._notify(c.creator_id, 'نزاع مفتوح', 'الأدمن يراجع التحدي.', 'dispute', '/challenges/' || c.id::text);
    PERFORM public._notify(c.opponent_id, 'نزاع مفتوح', 'الأدمن يراجع التحدي.', 'dispute', '/challenges/' || c.id::text);
    PERFORM public._audit(uid, 'challenge.dispute_auto', 'challenge', c.id, '{}'::jsonb);
    RETURN 'disputed';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.submit_challenge_result(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(_dispute_id UUID, _winner UUID, _resolution TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); d public.disputes; c public.challenges;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO d FROM public.disputes WHERE id = _dispute_id FOR UPDATE;
  IF d IS NULL THEN RAISE EXCEPTION 'dispute_not_found'; END IF;
  IF d.status = 'resolved' THEN RAISE EXCEPTION 'already_resolved'; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = d.challenge_id FOR UPDATE;
  IF _winner IS NULL THEN
    PERFORM public._wallet_change(c.creator_id, 0, -c.entry_fee, 'refund', c.entry_fee, c.id, 'استرداد بسبب نزاع');
    IF c.opponent_id IS NOT NULL THEN
      PERFORM public._wallet_change(c.opponent_id, 0, -c.entry_fee, 'refund', c.entry_fee, c.id, 'استرداد بسبب نزاع');
    END IF;
    UPDATE public.challenges SET status = 'cancelled', updated_at = now() WHERE id = c.id;
  ELSE
    PERFORM public._settle_challenge(c, _winner);
  END IF;
  UPDATE public.disputes SET status = 'resolved', winner_id = _winner, resolved_by = uid, resolved_at = now(), resolution = _resolution WHERE id = d.id;
  PERFORM public._audit(uid, 'dispute.resolve', 'dispute', d.id, jsonb_build_object('winner', _winner));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(UUID, UUID, TEXT) TO authenticated;

-- ==================== DEPOSITS ====================

CREATE OR REPLACE FUNCTION public.admin_approve_deposit(_deposit_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); d public.deposits;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO d FROM public.deposits WHERE id = _deposit_id FOR UPDATE;
  IF d IS NULL THEN RAISE EXCEPTION 'deposit_not_found'; END IF;
  IF d.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  PERFORM public._wallet_change(d.user_id, d.amount, 0, 'deposit', d.amount, d.id, 'إيداع معتمد');
  UPDATE public.deposits SET status = 'approved', processed_by = uid, processed_at = now(), updated_at = now() WHERE id = d.id;
  PERFORM public._notify(d.user_id, 'تم اعتماد إيداعك', 'تمت إضافة ' || d.amount || ' د.م إلى محفظتك.', 'wallet', '/wallet');
  PERFORM public._audit(uid, 'deposit.approve', 'deposit', d.id, jsonb_build_object('amount', d.amount));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_approve_deposit(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_deposit(_deposit_id UUID, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); d public.deposits;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO d FROM public.deposits WHERE id = _deposit_id FOR UPDATE;
  IF d IS NULL THEN RAISE EXCEPTION 'deposit_not_found'; END IF;
  IF d.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  UPDATE public.deposits SET status = 'rejected', admin_note = _note, processed_by = uid, processed_at = now(), updated_at = now() WHERE id = d.id;
  PERFORM public._notify(d.user_id, 'تم رفض إيداعك', COALESCE(_note, 'يرجى مراجعة الإدارة'), 'wallet', '/wallet');
  PERFORM public._audit(uid, 'deposit.reject', 'deposit', d.id, jsonb_build_object('note', _note));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reject_deposit(UUID, TEXT) TO authenticated;

-- ==================== WITHDRAWALS ====================

CREATE OR REPLACE FUNCTION public.create_withdrawal(
  _method TEXT, _account_holder TEXT, _bank_name TEXT, _account_number TEXT, _amount NUMERIC
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); s public.platform_settings; wid UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  SELECT * INTO s FROM public.platform_settings WHERE id = true;
  IF _amount < s.min_withdrawal OR _amount > s.max_withdrawal THEN RAISE EXCEPTION 'amount_out_of_range'; END IF;
  INSERT INTO public.withdrawals(user_id, method, account_holder, bank_name, account_number, amount, status)
    VALUES (uid, _method, _account_holder, NULLIF(_bank_name,''), _account_number, _amount, 'pending')
    RETURNING id INTO wid;
  PERFORM public._wallet_change(uid, 0, _amount, 'withdrawal', _amount, wid, 'حجز طلب سحب');
  PERFORM public._audit(uid, 'withdrawal.create', 'withdrawal', wid, jsonb_build_object('amount', _amount));
  RETURN wid;
END $$;
GRANT EXECUTE ON FUNCTION public.create_withdrawal(TEXT, TEXT, TEXT, TEXT, NUMERIC) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_approve_withdrawal(_wd_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); w public.withdrawals;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO w FROM public.withdrawals WHERE id = _wd_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF w.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  PERFORM public._wallet_change(w.user_id, -w.amount, -w.amount, 'withdrawal', w.amount, w.id, 'سحب معتمد');
  UPDATE public.withdrawals SET status = 'approved', processed_by = uid, processed_at = now(), updated_at = now() WHERE id = w.id;
  PERFORM public._notify(w.user_id, 'تم اعتماد سحبك', 'تم صرف ' || w.amount || ' د.م', 'wallet', '/wallet');
  PERFORM public._audit(uid, 'withdrawal.approve', 'withdrawal', w.id, jsonb_build_object('amount', w.amount));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_approve_withdrawal(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(_wd_id UUID, _note TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); w public.withdrawals;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO w FROM public.withdrawals WHERE id = _wd_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF w.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  PERFORM public._wallet_change(w.user_id, 0, -w.amount, 'refund', w.amount, w.id, 'استرداد سحب مرفوض');
  UPDATE public.withdrawals SET status = 'rejected', admin_note = _note, processed_by = uid, processed_at = now(), updated_at = now() WHERE id = w.id;
  PERFORM public._notify(w.user_id, 'تم رفض سحبك', COALESCE(_note,''), 'wallet', '/wallet');
  PERFORM public._audit(uid, 'withdrawal.reject', 'withdrawal', w.id, jsonb_build_object('note', _note));
END $$;
GRANT EXECUTE ON FUNCTION public.admin_reject_withdrawal(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_withdrawal(_wd_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); w public.withdrawals;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO w FROM public.withdrawals WHERE id = _wd_id FOR UPDATE;
  IF w IS NULL THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
  IF w.user_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF w.status <> 'pending' THEN RAISE EXCEPTION 'not_pending'; END IF;
  PERFORM public._wallet_change(uid, 0, -w.amount, 'refund', w.amount, w.id, 'إلغاء طلب سحب');
  UPDATE public.withdrawals SET status = 'cancelled', updated_at = now() WHERE id = w.id;
  PERFORM public._audit(uid, 'withdrawal.cancel', 'withdrawal', w.id, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal(UUID) TO authenticated;
