
-- Phase 1: Gaming Core — Ready System, Match Room, King of Arena

-- Add lobby / ready system columns to challenges
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS creator_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opponent_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- RPC: toggle ready state for a participant. When both ready, start match.
CREATE OR REPLACE FUNCTION public.set_challenge_ready(_challenge_id UUID, _ready BOOLEAN)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  c public.challenges;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = _challenge_id FOR UPDATE;
  IF c IS NULL THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF uid NOT IN (c.creator_id, COALESCE(c.opponent_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;
  IF c.status NOT IN ('accepted','in_progress') THEN
    RAISE EXCEPTION 'not_in_lobby';
  END IF;

  IF uid = c.creator_id THEN
    UPDATE public.challenges SET creator_ready = _ready, updated_at = now() WHERE id = c.id;
  ELSE
    UPDATE public.challenges SET opponent_ready = _ready, updated_at = now() WHERE id = c.id;
  END IF;

  SELECT * INTO c FROM public.challenges WHERE id = _challenge_id FOR UPDATE;

  IF c.creator_ready AND c.opponent_ready AND c.match_started_at IS NULL THEN
    UPDATE public.challenges
      SET match_started_at = now() + interval '15 seconds',
          status = 'in_progress',
          updated_at = now()
      WHERE id = c.id;
    PERFORM public._notify(c.creator_id, 'المباراة بدأت!', 'العد التنازلي انتهى — بالتوفيق', 'challenge', '/challenges/' || c.id::text);
    PERFORM public._notify(c.opponent_id, 'المباراة بدأت!', 'العد التنازلي انتهى — بالتوفيق', 'challenge', '/challenges/' || c.id::text);
    RETURN 'match_started';
  END IF;
  RETURN 'ok';
END $$;

-- Update join_challenge to set 'accepted' instead of 'in_progress' (lobby step)
CREATE OR REPLACE FUNCTION public.join_challenge(_challenge_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid UUID := auth.uid(); c public.challenges;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = _challenge_id FOR UPDATE;
  IF c IS NULL THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF c.status <> 'open' THEN RAISE EXCEPTION 'challenge_not_open'; END IF;
  IF c.creator_id = uid THEN RAISE EXCEPTION 'cannot_join_own_challenge'; END IF;
  IF c.opponent_id IS NOT NULL THEN RAISE EXCEPTION 'challenge_full'; END IF;
  PERFORM public._wallet_change(uid, 0, c.entry_fee, 'challenge_entry', c.entry_fee, c.id, 'حجز رسوم قبول تحدي');
  UPDATE public.challenges
    SET opponent_id = uid, status = 'accepted', creator_ready = false, opponent_ready = false, updated_at = now()
    WHERE id = c.id;
  PERFORM public._audit(uid, 'challenge.join', 'challenge', c.id, jsonb_build_object('entry_fee', c.entry_fee));
  PERFORM public._notify(c.creator_id, 'انضم لاعب لتحديك', 'ادخل غرفة اللوبي واضغط "جاهز" لبدء المباراة', 'challenge', '/challenges/' || c.id::text);
END $$;

GRANT EXECUTE ON FUNCTION public.set_challenge_ready(UUID, BOOLEAN) TO authenticated;
