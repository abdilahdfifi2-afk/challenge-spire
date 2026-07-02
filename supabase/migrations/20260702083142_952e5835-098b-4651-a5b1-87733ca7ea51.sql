
-- messages table for challenge chat
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id UUID NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT,
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','system')),
  image_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_challenge ON public.messages(challenge_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON public.messages(sender_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Helper: participant check
CREATE OR REPLACE FUNCTION public.is_challenge_participant(_challenge_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.challenges c
    WHERE c.id = _challenge_id
      AND (_user_id = c.creator_id OR _user_id = c.opponent_id)
  );
$$;

-- SELECT: participants OR admin
CREATE POLICY "chat_select_participants_or_admin"
ON public.messages FOR SELECT
TO authenticated
USING (
  public.is_challenge_participant(challenge_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'moderator')
);

-- INSERT: only participant sending as themselves, and only if challenge is active
-- (not completed/cancelled) unless there is an open dispute
CREATE POLICY "chat_insert_participants_active"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND public.is_challenge_participant(challenge_id, auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.challenges c
    WHERE c.id = challenge_id
      AND (
        c.status NOT IN ('completed','cancelled')
        OR EXISTS (
          SELECT 1 FROM public.disputes d
          WHERE d.challenge_id = c.id AND d.status = 'open'
        )
      )
  )
);

-- UPDATE: participant can mark messages as read (only is_read on messages not sent by them)
CREATE POLICY "chat_update_mark_read"
ON public.messages FOR UPDATE
TO authenticated
USING (
  public.is_challenge_participant(challenge_id, auth.uid())
  AND sender_id <> auth.uid()
)
WITH CHECK (
  public.is_challenge_participant(challenge_id, auth.uid())
);

-- DELETE: admin or moderator only
CREATE POLICY "chat_delete_admin"
ON public.messages FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Storage policies for chat images inside `proofs` bucket under folder `chat/<challenge_id>/...`
-- (bucket already exists and is private)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chat_images_read') THEN
    CREATE POLICY "chat_images_read" ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'proofs'
      AND (storage.foldername(name))[1] = 'chat'
      AND (
        public.is_challenge_participant(((storage.foldername(name))[2])::uuid, auth.uid())
        OR public.has_role(auth.uid(), 'admin')
        OR public.has_role(auth.uid(), 'moderator')
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chat_images_insert') THEN
    CREATE POLICY "chat_images_insert" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'proofs'
      AND (storage.foldername(name))[1] = 'chat'
      AND public.is_challenge_participant(((storage.foldername(name))[2])::uuid, auth.uid())
    );
  END IF;
END $$;
