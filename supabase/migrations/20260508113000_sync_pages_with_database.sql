-- Synchronize the remaining pages with Postgres data.

CREATE TABLE public.perfil_usuario (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  preferred_voice TEXT NOT NULL DEFAULT 'Sofia (Femenina)',
  rehearsal_mode TEXT NOT NULL DEFAULT 'individual' CHECK (rehearsal_mode IN ('individual', 'grupo', 'lectura')),
  ai_difficulty INTEGER NOT NULL DEFAULT 50 CHECK (ai_difficulty >= 0 AND ai_difficulty <= 100),
  suggest_emotions BOOLEAN NOT NULL DEFAULT true,
  allow_improv BOOLEAN NOT NULL DEFAULT true,
  feedback_enabled BOOLEAN NOT NULL DEFAULT true,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  offline_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  privacy_level TEXT NOT NULL DEFAULT 'privado' CHECK (privacy_level IN ('privado', 'equipo', 'publico')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.perfil_usuario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own perfil_usuario"
  ON public.perfil_usuario FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own perfil_usuario"
  ON public.perfil_usuario FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own perfil_usuario"
  ON public.perfil_usuario FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_perfil_usuario_updated_at
BEFORE UPDATE ON public.perfil_usuario
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rehearsal_sessions
  ADD COLUMN selected_character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  ADD COLUMN completed_lines INTEGER NOT NULL DEFAULT 0 CHECK (completed_lines >= 0),
  ADD COLUMN total_lines INTEGER NOT NULL DEFAULT 0 CHECK (total_lines >= 0),
  ADD COLUMN repeated_lines INTEGER NOT NULL DEFAULT 0 CHECK (repeated_lines >= 0),
  ADD COLUMN skipped_lines INTEGER NOT NULL DEFAULT 0 CHECK (skipped_lines >= 0),
  ADD COLUMN clarity_score INTEGER CHECK (clarity_score IS NULL OR (clarity_score >= 0 AND clarity_score <= 100)),
  ADD COLUMN expression_score INTEGER CHECK (expression_score IS NULL OR (expression_score >= 0 AND expression_score <= 100)),
  ADD COLUMN rhythm_score INTEGER CHECK (rhythm_score IS NULL OR (rhythm_score >= 0 AND rhythm_score <= 100)),
  ADD COLUMN projection_score INTEGER CHECK (projection_score IS NULL OR (projection_score >= 0 AND projection_score <= 100)),
  ADD COLUMN memorization_score INTEGER CHECK (memorization_score IS NULL OR (memorization_score >= 0 AND memorization_score <= 100)),
  ADD COLUMN feedback_summary TEXT;

CREATE TABLE public.script_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  line_order INTEGER NOT NULL CHECK (line_order > 0),
  text TEXT NOT NULL,
  cue TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 4 CHECK (duration_seconds > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scene_id, line_order)
);

CREATE INDEX script_lines_scene_id_idx ON public.script_lines(scene_id);
CREATE INDEX script_lines_character_id_idx ON public.script_lines(character_id);

ALTER TABLE public.script_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Script lines are readable through readable scenes"
  ON public.script_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.scenes
      JOIN public.scripts ON scripts.id = scenes.script_id
      WHERE scenes.id = script_lines.scene_id
        AND (scripts.is_public OR scripts.user_id = auth.uid())
    )
  );

CREATE POLICY "Users insert script lines for own scripts"
  ON public.script_lines FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.scenes
      JOIN public.scripts ON scripts.id = scenes.script_id
      WHERE scenes.id = script_lines.scene_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update script lines for own scripts"
  ON public.script_lines FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.scenes
      JOIN public.scripts ON scripts.id = scenes.script_id
      WHERE scenes.id = script_lines.scene_id
        AND scripts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.scenes
      JOIN public.scripts ON scripts.id = scenes.script_id
      WHERE scenes.id = script_lines.scene_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete script lines for own scripts"
  ON public.script_lines FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.scenes
      JOIN public.scripts ON scripts.id = scenes.script_id
      WHERE scenes.id = script_lines.scene_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE TABLE public.rehearsal_highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.rehearsal_sessions(id) ON DELETE CASCADE,
  event_time TEXT NOT NULL,
  note TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rehearsal_highlights_session_id_idx ON public.rehearsal_highlights(session_id);

ALTER TABLE public.rehearsal_highlights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rehearsal highlights are readable through sessions"
  ON public.rehearsal_highlights FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rehearsal_sessions
      WHERE rehearsal_sessions.id = rehearsal_highlights.session_id
        AND (rehearsal_sessions.user_id IS NULL OR rehearsal_sessions.user_id = auth.uid())
    )
  );

CREATE POLICY "Users insert own rehearsal highlights"
  ON public.rehearsal_highlights FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rehearsal_sessions
      WHERE rehearsal_sessions.id = rehearsal_highlights.session_id
        AND rehearsal_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own rehearsal highlights"
  ON public.rehearsal_highlights FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rehearsal_sessions
      WHERE rehearsal_sessions.id = rehearsal_highlights.session_id
        AND rehearsal_sessions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rehearsal_sessions
      WHERE rehearsal_sessions.id = rehearsal_highlights.session_id
        AND rehearsal_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own rehearsal highlights"
  ON public.rehearsal_highlights FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.rehearsal_sessions
      WHERE rehearsal_sessions.id = rehearsal_highlights.session_id
        AND rehearsal_sessions.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_name TEXT;
BEGIN
  resolved_name := COALESCE(
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.raw_user_meta_data ->> 'name'
  );

  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    resolved_name,
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url;

  INSERT INTO public.perfil_usuario (user_id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    resolved_name,
    NEW.email,
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url;

  RETURN NEW;
END;
$$;

INSERT INTO public.script_lines (id, scene_id, character_id, line_order, text, cue, duration_seconds)
VALUES
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000301', 1, 'De que luz se alimenta esa ventana? Es el este, y Julieta es el sol!', 'Esperando tu respuesta...', 6),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000302', 2, 'Es Romeo, y Romeo es el mismo! Ah, Romeo, por que eres tu Romeo!', 'La IA prepara su entrada.', 4),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000301', 3, 'Niega a tu padre y rehusa tu nombre; o, si no quieres, jura que me amas.', 'Retoma con intencion romantica.', 6),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000302', 4, 'Solo tu nombre es mi enemigo; tu eres tu mismo, aunque no seas Montesco.', 'Mantener pausa dramatica.', 6),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000301', 5, 'Con un nombre no se que decirte quien soy; mi nombre, santa querida, me es odioso.', 'Sube la emocion sin perder claridad.', 6),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000302', 6, 'Mis oidos aun no han bebido cien palabras de tu boca, y ya conozco el sonido.', 'Cerrar con ternura.', 5),
  ('00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000304', 1, 'Ser o no ser, esa es la cuestion.', 'Entrar con duda contenida.', 5),
  ('00000000-0000-4000-8000-000000000508', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000305', 2, 'Tu tristeza nubla la sala, Hamlet.', 'Responder con cautela.', 4)
ON CONFLICT (id) DO NOTHING;

UPDATE public.rehearsal_sessions
SET selected_character_id = '00000000-0000-4000-8000-000000000301',
    completed_lines = 18,
    total_lines = 18,
    repeated_lines = 2,
    skipped_lines = 0,
    clarity_score = 90,
    expression_score = 85,
    rhythm_score = 82,
    projection_score = 88,
    memorization_score = 89,
    feedback_summary = 'Mostraste gran conexion emocional y un ritmo consistente. Sigue practicando la pausa antes de responder.'
WHERE id = '00000000-0000-4000-8000-000000000401';

UPDATE public.rehearsal_sessions
SET selected_character_id = '00000000-0000-4000-8000-000000000304',
    completed_lines = 14,
    total_lines = 16,
    repeated_lines = 1,
    skipped_lines = 1,
    clarity_score = 83,
    expression_score = 80,
    rhythm_score = 78,
    projection_score = 85,
    memorization_score = 84,
    feedback_summary = 'Buen control del texto, con oportunidad de sostener mejor el ritmo dramatico.'
WHERE id = '00000000-0000-4000-8000-000000000402';

UPDATE public.rehearsal_sessions
SET selected_character_id = '00000000-0000-4000-8000-000000000301',
    completed_lines = 12,
    total_lines = 15,
    repeated_lines = 3,
    skipped_lines = 0,
    clarity_score = 79,
    expression_score = 76,
    rhythm_score = 81,
    projection_score = 78,
    memorization_score = 80,
    feedback_summary = 'La lectura fue estable; conviene reforzar proyeccion y memorizacion.'
WHERE id = '00000000-0000-4000-8000-000000000403';

INSERT INTO public.rehearsal_highlights (id, session_id, event_time, note, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000401', '00:04:32', 'Excelente proyeccion de voz', 1),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000401', '00:08:11', 'Buena pausa dramatica', 2),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-000000000401', '00:14:27', 'Emocion muy convincente', 3),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-000000000402', '00:03:10', 'Buen inicio de monologo', 1),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-000000000402', '00:09:42', 'Mejoria notable en intencion', 2)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
