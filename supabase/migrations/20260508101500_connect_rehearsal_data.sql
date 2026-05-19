-- Core rehearsal data for the application.
-- Public rows are used as demo/catalog content; user-created rows are private.

CREATE TABLE public.scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  genre TEXT,
  act_count INTEGER NOT NULL DEFAULT 1 CHECK (act_count > 0),
  description TEXT,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  location TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  actor_type TEXT NOT NULL DEFAULT 'ai' CHECK (actor_type IN ('user', 'ai')),
  voice TEXT,
  base_emotion TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.rehearsal_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL,
  scene_id UUID REFERENCES public.scenes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'active', 'completed')),
  mode TEXT NOT NULL DEFAULT 'individual',
  score INTEGER CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  ai_difficulty INTEGER NOT NULL DEFAULT 50 CHECK (ai_difficulty >= 0 AND ai_difficulty <= 100),
  suggest_emotions BOOLEAN NOT NULL DEFAULT true,
  allow_improv BOOLEAN NOT NULL DEFAULT true,
  feedback_enabled BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scripts_user_id_idx ON public.scripts(user_id);
CREATE INDEX scripts_public_idx ON public.scripts(is_public);
CREATE INDEX scenes_script_id_idx ON public.scenes(script_id);
CREATE INDEX characters_script_id_idx ON public.characters(script_id);
CREATE INDEX rehearsal_sessions_user_id_idx ON public.rehearsal_sessions(user_id);
CREATE INDEX rehearsal_sessions_updated_at_idx ON public.rehearsal_sessions(updated_at DESC);

ALTER TABLE public.scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rehearsal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scripts are readable by owner or public"
  ON public.scripts FOR SELECT
  USING (is_public OR auth.uid() = user_id);

CREATE POLICY "Users insert own scripts"
  ON public.scripts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own scripts"
  ON public.scripts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own scripts"
  ON public.scripts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Scenes are readable through readable scripts"
  ON public.scenes FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = scenes.script_id
        AND (scripts.is_public OR scripts.user_id = auth.uid())
    )
  );

CREATE POLICY "Users insert scenes for own scripts"
  ON public.scenes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = scenes.script_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update scenes for own scripts"
  ON public.scenes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = scenes.script_id
        AND scripts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = scenes.script_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete scenes for own scripts"
  ON public.scenes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = scenes.script_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE POLICY "Characters are readable through readable scripts"
  ON public.characters FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = characters.script_id
        AND (scripts.is_public OR scripts.user_id = auth.uid())
    )
  );

CREATE POLICY "Users insert characters for own scripts"
  ON public.characters FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = characters.script_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update characters for own scripts"
  ON public.characters FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = characters.script_id
        AND scripts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = characters.script_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete characters for own scripts"
  ON public.characters FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.scripts
      WHERE scripts.id = characters.script_id
        AND scripts.user_id = auth.uid()
    )
  );

CREATE POLICY "Rehearsal sessions are readable by owner or demo"
  ON public.rehearsal_sessions FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Users insert own rehearsal sessions"
  ON public.rehearsal_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own rehearsal sessions"
  ON public.rehearsal_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own rehearsal sessions"
  ON public.rehearsal_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_scripts_updated_at
BEFORE UPDATE ON public.scripts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_rehearsal_sessions_updated_at
BEFORE UPDATE ON public.rehearsal_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.scripts (id, title, author, genre, act_count, description, is_favorite, is_active, is_public, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000101', 'Romeo y Julieta', 'William Shakespeare', 'Drama', 2, 'La obra narra la historia de amor entre Romeo Montesco y Julieta Capuleto, dos jovenes enamorados cuyas familias estan enfrentadas.', true, true, true, now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000102', 'Hamlet', 'William Shakespeare', 'Drama', 5, 'El principe Hamlet busca la verdad tras la muerte de su padre y enfrenta una corte marcada por la duda.', false, false, true, now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000103', 'La casa de Bernarda Alba', 'Federico Garcia Lorca', 'Drama', 3, 'Bernarda impone un luto rigido a sus hijas, desatando deseo, silencio y conflicto familiar.', false, false, true, now() - interval '5 days', now() - interval '5 days'),
  ('00000000-0000-4000-8000-000000000104', 'Esperando a Godot', 'Samuel Beckett', 'Absurdo', 2, 'Dos personajes esperan a alguien que nunca llega mientras el tiempo se vuelve circular.', false, false, true, now() - interval '7 days', now() - interval '7 days'),
  ('00000000-0000-4000-8000-000000000105', 'La importancia de llamarse Ernesto', 'Oscar Wilde', 'Comedia', 3, 'Una comedia de identidades, ingenio social y enredos romanticos.', false, false, true, now() - interval '14 days', now() - interval '14 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.scenes (id, script_id, title, location, description, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Escena 1', 'Verona', 'Primer encuentro entre las familias enfrentadas.', 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'Escena 2 - Balcon', 'Patio de la casa Capuleto', 'Romeo visita a Julieta en su balcon durante la noche.', 2),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102', 'Escena 4', 'Castillo de Elsinor', 'Hamlet encara una decision que cambiara su destino.', 4)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.characters (id, script_id, name, role, actor_type, voice, base_emotion, sort_order)
VALUES
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', 'Romeo', 'Protagonista', 'user', 'Tu voz', 'Enamorado', 1),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000101', 'Julieta', 'Protagonista', 'ai', 'Sofia (Femenina)', 'Romantica', 2),
  ('00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000101', 'Fray Lorenzo', 'Secundario', 'ai', 'Diego (Masculina)', 'Serena', 3),
  ('00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000102', 'Hamlet', 'Protagonista', 'user', 'Tu voz', 'Dubitativo', 1),
  ('00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000102', 'Claudio', 'Antagonista', 'ai', 'Diego (Masculina)', 'Tenso', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.rehearsal_sessions (id, script_id, scene_id, score, mode, ai_difficulty, suggest_emotions, allow_improv, feedback_enabled, started_at, ended_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000202', 87, 'individual', 72, true, true, true, now() - interval '2 days 35 minutes', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000203', 82, 'individual', 68, true, false, true, now() - interval '1 day 28 minutes', now() - interval '1 day', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', 79, 'lectura', 55, false, true, false, now() - interval '4 days 20 minutes', now() - interval '4 days', now() - interval '4 days')
ON CONFLICT (id) DO NOTHING;
