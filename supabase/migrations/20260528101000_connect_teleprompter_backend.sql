-- Link Supabase rehearsal rows with the local FastAPI teleprompter runtime.

ALTER TABLE public.rehearsal_sessions
  ADD COLUMN IF NOT EXISTS teleprompter_session_id TEXT,
  ADD COLUMN IF NOT EXISTS teleprompter_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (teleprompter_status IN ('pending', 'ready', 'running', 'stopped', 'error')),
  ADD COLUMN IF NOT EXISTS teleprompter_last_event TEXT;

CREATE INDEX IF NOT EXISTS rehearsal_sessions_teleprompter_session_id_idx
  ON public.rehearsal_sessions(teleprompter_session_id);

CREATE TABLE IF NOT EXISTS public.teleprompter_recordings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rehearsal_session_id UUID NOT NULL REFERENCES public.rehearsal_sessions(id) ON DELETE CASCADE,
  teleprompter_session_id TEXT NOT NULL,
  recording_id TEXT,
  character_name TEXT NOT NULL,
  segment_index INTEGER NOT NULL CHECK (segment_index >= 0),
  segment_text TEXT,
  audio_url TEXT,
  duration_sec NUMERIC CHECK (duration_sec IS NULL OR duration_sec >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teleprompter_recordings_user_id_idx
  ON public.teleprompter_recordings(user_id);

CREATE INDEX IF NOT EXISTS teleprompter_recordings_rehearsal_session_id_idx
  ON public.teleprompter_recordings(rehearsal_session_id);

CREATE INDEX IF NOT EXISTS teleprompter_recordings_session_segment_idx
  ON public.teleprompter_recordings(teleprompter_session_id, segment_index);

ALTER TABLE public.teleprompter_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own teleprompter recordings"
  ON public.teleprompter_recordings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own teleprompter recordings"
  ON public.teleprompter_recordings FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.rehearsal_sessions
      WHERE rehearsal_sessions.id = teleprompter_recordings.rehearsal_session_id
        AND rehearsal_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own teleprompter recordings"
  ON public.teleprompter_recordings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own teleprompter recordings"
  ON public.teleprompter_recordings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_teleprompter_recordings_updated_at
BEFORE UPDATE ON public.teleprompter_recordings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
