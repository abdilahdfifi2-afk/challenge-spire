
REVOKE EXECUTE ON FUNCTION public.create_challenge_with_lock(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_challenge(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_challenge(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_challenge_result(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_dispute(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_approve_deposit(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reject_deposit(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_withdrawal(TEXT, TEXT, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_approve_withdrawal(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_reject_withdrawal(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_withdrawal(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public._settle_challenge(public.challenges, UUID) FROM PUBLIC, anon, authenticated;
