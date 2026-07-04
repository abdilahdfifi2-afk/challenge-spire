CREATE OR REPLACE FUNCTION public.admin_list_deposits(_status text DEFAULT 'pending')
RETURNS TABLE (
  id uuid,
  user_id uuid,
  bank_id uuid,
  amount numeric,
  currency text,
  proof_url text,
  status text,
  admin_note text,
  processed_by uuid,
  processed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  bank_name text,
  username text,
  display_name text,
  avatar_url text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.user_id,
    d.bank_id,
    d.amount,
    d.currency,
    d.proof_url,
    d.status::text,
    d.admin_note,
    d.processed_by,
    d.processed_at,
    d.created_at,
    d.updated_at,
    b.name AS bank_name,
    p.username,
    p.display_name,
    p.avatar_url
  FROM public.deposits d
  LEFT JOIN public.banks b ON b.id = d.bank_id
  LEFT JOIN public.profiles p ON p.id = d.user_id
  WHERE COALESCE(_status, 'all') = 'all'
     OR d.status::text = _status
  ORDER BY d.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_deposits(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_deposits(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_deposits(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_deposits(text) TO service_role;