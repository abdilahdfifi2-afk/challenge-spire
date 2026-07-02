
-- Performance indexes
CREATE INDEX IF NOT EXISTS challenges_status_created_idx ON public.challenges(status, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_tx_user_created_idx ON public.wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_challenge_created_idx ON public.messages(challenge_id, created_at ASC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tournaments_status_created_idx ON public.tournaments(status, created_at DESC);

-- Extend submit_challenge_result with optional proof
CREATE OR REPLACE FUNCTION public.submit_challenge_result(_challenge_id uuid, _winner uuid, _proof_url text DEFAULT NULL)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  INSERT INTO public.match_results(challenge_id, submitted_by, claimed_winner, status, proof_url)
    VALUES (c.id, uid, _winner, 'pending', NULLIF(_proof_url,''));
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
END $function$;
