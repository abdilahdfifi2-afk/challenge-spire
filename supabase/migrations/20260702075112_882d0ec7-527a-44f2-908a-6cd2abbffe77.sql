
-- proofs: user uploads to their folder, admin reads all
CREATE POLICY "proofs_user_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='proofs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "proofs_user_read_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='proofs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(),'admin')));

-- avatars
CREATE POLICY "avatars_read_authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='avatars');
CREATE POLICY "avatars_user_write_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_user_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- assets: admin only write, all authenticated read
CREATE POLICY "assets_read_all" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='assets');
CREATE POLICY "assets_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='assets' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "assets_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='assets' AND public.has_role(auth.uid(),'admin'));
CREATE POLICY "assets_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='assets' AND public.has_role(auth.uid(),'admin'));
