REVOKE EXECUTE ON FUNCTION public.is_challenge_participant(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_challenge_participant(UUID, UUID) TO authenticated, service_role;