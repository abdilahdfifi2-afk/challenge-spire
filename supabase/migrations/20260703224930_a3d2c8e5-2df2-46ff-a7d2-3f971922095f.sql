-- Add FKs from user columns to public.profiles so PostgREST can resolve embeds in admin/list queries.
-- profiles.id already references auth.users(id), so any valid user_id already has a matching profile row.
ALTER TABLE public.deposits
  ADD CONSTRAINT deposits_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.withdrawals
  ADD CONSTRAINT withdrawals_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.tournament_participants
  ADD CONSTRAINT tournament_participants_user_profile_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_creator_profile_fkey FOREIGN KEY (creator_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_opponent_profile_fkey FOREIGN KEY (opponent_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_profile_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE SET NULL;