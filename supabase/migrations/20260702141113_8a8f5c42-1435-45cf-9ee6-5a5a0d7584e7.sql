
-- ============ Phase 1 remainder: challenge invites ============

CREATE OR REPLACE FUNCTION public.invite_to_challenge(_challenge_id uuid, _username text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  c public.challenges;
  target UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO c FROM public.challenges WHERE id = _challenge_id;
  IF c IS NULL THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF c.creator_id <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF c.status <> 'open' THEN RAISE EXCEPTION 'challenge_not_open'; END IF;

  SELECT id INTO target FROM public.profiles WHERE username = _username OR display_name = _username LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  IF target = uid THEN RAISE EXCEPTION 'cannot_invite_self'; END IF;

  PERFORM public._notify(target, 'دعوة تحدٍ جديدة',
    'دعاك لاعب لخوض تحدٍ — اضغط لعرض التفاصيل والانضمام',
    'challenge', '/challenges/' || c.id::text);
END $$;

GRANT EXECUTE ON FUNCTION public.invite_to_challenge(uuid, text) TO authenticated;

-- ============ Phase 2: Tournament brackets ============

-- 1. CREATE TABLE
CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  position INTEGER NOT NULL,
  player1_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  player2_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  next_match_id UUID REFERENCES public.tournament_matches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | ready | completed | bye
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round, position)
);
CREATE INDEX IF NOT EXISTS idx_tm_tournament ON public.tournament_matches(tournament_id);

-- 2. GRANTS
GRANT SELECT ON public.tournament_matches TO authenticated;
GRANT SELECT ON public.tournament_matches TO anon;
GRANT ALL ON public.tournament_matches TO service_role;

-- 3. RLS
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES
CREATE POLICY "Anyone can view tournament matches"
  ON public.tournament_matches FOR SELECT
  USING (true);

CREATE TRIGGER update_tournament_matches_updated_at
  BEFORE UPDATE ON public.tournament_matches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Join tournament with entry fee lock
CREATE OR REPLACE FUNCTION public.join_tournament(_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  t public.tournaments;
  current_count INTEGER;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO t FROM public.tournaments WHERE id = _tournament_id FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF t.status <> 'open' THEN RAISE EXCEPTION 'tournament_not_open'; END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_participants WHERE tournament_id = t.id AND user_id = uid) THEN
    RAISE EXCEPTION 'already_joined';
  END IF;

  SELECT COUNT(*) INTO current_count FROM public.tournament_participants WHERE tournament_id = t.id;
  IF current_count >= t.max_players THEN RAISE EXCEPTION 'tournament_full'; END IF;

  IF t.entry_fee > 0 THEN
    PERFORM public._wallet_change(uid, 0, t.entry_fee, 'tournament_entry', t.entry_fee, t.id, 'حجز رسوم دخول بطولة');
  END IF;

  INSERT INTO public.tournament_participants(tournament_id, user_id) VALUES (t.id, uid);
  PERFORM public._audit(uid, 'tournament.join', 'tournament', t.id, jsonb_build_object('entry_fee', t.entry_fee));
END $$;

GRANT EXECUTE ON FUNCTION public.join_tournament(uuid) TO authenticated;

-- Generate single-elimination bracket
CREATE OR REPLACE FUNCTION public.generate_tournament_bracket(_tournament_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  t public.tournaments;
  participant_ids UUID[];
  n INTEGER;
  bracket_size INTEGER;
  total_rounds INTEGER;
  round_num INTEGER;
  matches_in_round INTEGER;
  i INTEGER;
  match_id UUID;
  next_ids UUID[];
  cur_ids UUID[];
  p1 UUID;
  p2 UUID;
  next_match UUID;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN
    SELECT * INTO t FROM public.tournaments WHERE id = _tournament_id;
    IF t IS NULL OR t.created_by <> uid THEN RAISE EXCEPTION 'forbidden'; END IF;
  END IF;

  SELECT * INTO t FROM public.tournaments WHERE id = _tournament_id FOR UPDATE;
  IF t IS NULL THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF t.status NOT IN ('open','draft') THEN RAISE EXCEPTION 'invalid_status'; END IF;

  IF EXISTS (SELECT 1 FROM public.tournament_matches WHERE tournament_id = t.id) THEN
    RAISE EXCEPTION 'bracket_already_generated';
  END IF;

  -- Get participants, shuffled
  SELECT ARRAY(SELECT user_id FROM public.tournament_participants WHERE tournament_id = t.id ORDER BY random()) INTO participant_ids;
  n := array_length(participant_ids, 1);
  IF n IS NULL OR n < 2 THEN RAISE EXCEPTION 'not_enough_players'; END IF;

  -- Compute bracket size = next power of 2
  bracket_size := 1;
  WHILE bracket_size < n LOOP bracket_size := bracket_size * 2; END LOOP;
  total_rounds := (log(2, bracket_size))::int;

  -- Build rounds from final backwards so we can wire next_match_id
  -- Create empty match slots for each round.
  next_ids := ARRAY[]::UUID[];
  FOR round_num IN REVERSE total_rounds..1 LOOP
    matches_in_round := bracket_size / (2 ^ round_num)::int;
    cur_ids := ARRAY[]::UUID[];
    FOR i IN 1..matches_in_round LOOP
      next_match := CASE WHEN round_num = total_rounds THEN NULL ELSE next_ids[((i - 1) / 2) + 1] END;
      INSERT INTO public.tournament_matches(tournament_id, round, position, next_match_id, status)
        VALUES (t.id, round_num, i, next_match, 'pending')
        RETURNING id INTO match_id;
      cur_ids := array_append(cur_ids, match_id);
    END LOOP;
    next_ids := cur_ids;
  END LOOP;

  -- Seed round 1 with players (bye if odd)
  matches_in_round := bracket_size / 2;
  FOR i IN 1..matches_in_round LOOP
    p1 := participant_ids[(i - 1) * 2 + 1];
    p2 := participant_ids[(i - 1) * 2 + 2];
    UPDATE public.tournament_matches
      SET player1_id = p1,
          player2_id = p2,
          status = CASE
            WHEN p1 IS NOT NULL AND p2 IS NULL THEN 'bye'
            WHEN p1 IS NOT NULL AND p2 IS NOT NULL THEN 'ready'
            ELSE 'pending'
          END,
          winner_id = CASE WHEN p1 IS NOT NULL AND p2 IS NULL THEN p1 ELSE NULL END
      WHERE tournament_id = t.id AND round = 1 AND position = i;
  END LOOP;

  -- Auto-advance byes
  FOR match_id, p1, next_match IN
    SELECT id, winner_id, next_match_id FROM public.tournament_matches
      WHERE tournament_id = t.id AND round = 1 AND status = 'bye' AND next_match_id IS NOT NULL
  LOOP
    UPDATE public.tournament_matches
      SET player1_id = COALESCE(player1_id, p1),
          player2_id = CASE WHEN player1_id IS NOT NULL AND player2_id IS NULL THEN p1 ELSE player2_id END,
          status = CASE
            WHEN (COALESCE(player1_id, p1) IS NOT NULL AND (player2_id IS NOT NULL OR player1_id IS NOT NULL)) THEN status
            ELSE status
          END
      WHERE id = next_match;
  END LOOP;

  UPDATE public.tournaments SET status = 'in_progress', updated_at = now() WHERE id = t.id;
  PERFORM public._audit(uid, 'tournament.bracket_generated', 'tournament', t.id, jsonb_build_object('players', n));
END $$;

GRANT EXECUTE ON FUNCTION public.generate_tournament_bracket(uuid) TO authenticated;

-- Admin submits a match result; auto-advance winner
CREATE OR REPLACE FUNCTION public.submit_tournament_match(_match_id uuid, _winner uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  m public.tournament_matches;
  t public.tournaments;
  loser UUID;
  next_m public.tournament_matches;
BEGIN
  IF NOT public.has_role(uid, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO m FROM public.tournament_matches WHERE id = _match_id FOR UPDATE;
  IF m IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF m.status = 'completed' THEN RAISE EXCEPTION 'already_completed'; END IF;
  IF _winner NOT IN (m.player1_id, m.player2_id) THEN RAISE EXCEPTION 'invalid_winner'; END IF;

  loser := CASE WHEN _winner = m.player1_id THEN m.player2_id ELSE m.player1_id END;

  UPDATE public.tournament_matches
    SET winner_id = _winner, status = 'completed', updated_at = now()
    WHERE id = m.id;

  -- Advance winner
  IF m.next_match_id IS NOT NULL THEN
    SELECT * INTO next_m FROM public.tournament_matches WHERE id = m.next_match_id FOR UPDATE;
    IF next_m.player1_id IS NULL THEN
      UPDATE public.tournament_matches SET player1_id = _winner,
        status = CASE WHEN player2_id IS NOT NULL THEN 'ready' ELSE status END
        WHERE id = next_m.id;
    ELSE
      UPDATE public.tournament_matches SET player2_id = _winner, status = 'ready' WHERE id = next_m.id;
    END IF;
  ELSE
    -- Final match completed -> settle tournament
    SELECT * INTO t FROM public.tournaments WHERE id = m.tournament_id FOR UPDATE;
    IF t.prize_pool > 0 THEN
      PERFORM public._wallet_change(_winner, t.prize_pool, 0, 'tournament_win', t.prize_pool, t.id, 'ربح بطولة');
    END IF;
    UPDATE public.tournament_participants SET placement = 1 WHERE tournament_id = t.id AND user_id = _winner;
    IF loser IS NOT NULL THEN
      UPDATE public.tournament_participants SET placement = 2 WHERE tournament_id = t.id AND user_id = loser;
    END IF;
    UPDATE public.tournaments SET status = 'completed', updated_at = now() WHERE id = t.id;
    UPDATE public.profiles SET wins = wins + 1, xp = xp + 200 WHERE id = _winner;
    PERFORM public._notify(_winner, 'بطل!', 'فزت بالبطولة "' || t.title || '" — تمت إضافة الجائزة إلى محفظتك.', 'tournament', '/tournaments/' || t.id::text);
  END IF;

  PERFORM public._audit(uid, 'tournament.match_result', 'tournament_match', m.id, jsonb_build_object('winner', _winner));
END $$;

GRANT EXECUTE ON FUNCTION public.submit_tournament_match(uuid, uuid) TO authenticated;
