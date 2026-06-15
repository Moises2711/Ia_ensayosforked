-- BUG 4/5/12: Columnas de score y transcripción por línea, bucket de audio

ALTER TABLE public.teleprompter_recordings
  ADD COLUMN IF NOT EXISTS similarity_score NUMERIC
    CHECK (similarity_score IS NULL OR (similarity_score >= 0 AND similarity_score <= 100)),
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC
    CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  ADD COLUMN IF NOT EXISTS transcription TEXT;

-- Bucket de Supabase Storage para audio de ensayos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rehearsal-audio',
  'rehearsal-audio',
  true,
  52428800,
  ARRAY['audio/webm', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas RLS para el bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'rehearsal_audio_insert'
  ) THEN
    CREATE POLICY "rehearsal_audio_insert"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'rehearsal-audio'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'rehearsal_audio_select'
  ) THEN
    CREATE POLICY "rehearsal_audio_select"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'rehearsal-audio');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'rehearsal_audio_update'
  ) THEN
    CREATE POLICY "rehearsal_audio_update"
    ON storage.objects FOR UPDATE TO authenticated
    USING (
      bucket_id = 'rehearsal-audio'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'rehearsal_audio_delete'
  ) THEN
    CREATE POLICY "rehearsal_audio_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'rehearsal-audio'
      AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;
