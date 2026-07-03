
-- 1. activity_feed: restrict SELECT to authenticated
DROP POLICY IF EXISTS "read activity" ON public.activity_feed;
CREATE POLICY "activity_feed_read_auth" ON public.activity_feed FOR SELECT TO authenticated USING (true);

-- 2. user_achievements: restrict SELECT to authenticated
DROP POLICY IF EXISTS "read user achievements" ON public.user_achievements;
CREATE POLICY "user_achievements_read_auth" ON public.user_achievements FOR SELECT TO authenticated USING (true);

-- 3. banks: restrict to authenticated
DROP POLICY IF EXISTS "banks_read_active" ON public.banks;
CREATE POLICY "banks_read_active" ON public.banks FOR SELECT TO authenticated USING (is_active OR has_role(auth.uid(),'admin'));

-- 4. challenges: restrict SELECT to authenticated
DROP POLICY IF EXISTS "challenges_read_all" ON public.challenges;
CREATE POLICY "challenges_read_auth" ON public.challenges FOR SELECT TO authenticated USING (true);

-- 5. user_roles: explicit admin-only writes (defense in depth)
DROP POLICY IF EXISTS "user_roles_admin_insert" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_update" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_admin_delete" ON public.user_roles;
CREATE POLICY "user_roles_admin_insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_update" ON public.user_roles FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_delete" ON public.user_roles FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- 6. withdrawals: explicit admin-only update/delete
DROP POLICY IF EXISTS "wd_admin_update" ON public.withdrawals;
DROP POLICY IF EXISTS "wd_admin_delete" ON public.withdrawals;
CREATE POLICY "wd_admin_update" ON public.withdrawals FOR UPDATE TO authenticated USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE POLICY "wd_admin_delete" ON public.withdrawals FOR DELETE TO authenticated USING (has_role(auth.uid(),'admin'));

-- 7. avatars DELETE policy for owner
DROP POLICY IF EXISTS "avatars_user_delete_own" ON storage.objects;
CREATE POLICY "avatars_user_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 8. proofs DELETE policy for owner
DROP POLICY IF EXISTS "proofs_user_delete_own" ON storage.objects;
CREATE POLICY "proofs_user_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'proofs' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 9. Revoke EXECUTE on internal SECURITY DEFINER helpers from anon/authenticated
REVOKE EXECUTE ON FUNCTION public._notify(uuid,text,text,text,text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._audit(uuid,text,text,uuid,jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._wallet_change(uuid,numeric,numeric,tx_type,numeric,uuid,text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._settle_challenge(public.challenges,uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._check_win_achievements(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._grant_achievement(uuid,text) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
