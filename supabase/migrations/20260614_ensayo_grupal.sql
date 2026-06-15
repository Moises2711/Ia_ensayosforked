-- Ensayo grupal: obtener grabaciones de otros actores del grupo para el script actual.
-- Usa SECURITY DEFINER para leer teleprompter_recordings de otros usuarios sin que
-- RLS lo bloquee. Verifica internamente que el llamador sea miembro del grupo.

DROP FUNCTION IF EXISTS obtener_grabaciones_grupo(UUID);

CREATE OR REPLACE FUNCTION obtener_grabaciones_grupo(p_script_id UUID)
RETURNS TABLE(
  recording_id TEXT,
  audio_url    TEXT,
  character_name TEXT,
  actor_user_id  UUID
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_grupo_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;

  -- Buscar el grupo al que pertenece este script Y del que el usuario es miembro
  SELECT gl.grupo_id INTO v_grupo_id
  FROM public.grupo_libretos gl
  JOIN public.grupo_miembros gm
    ON gm.grupo_id = gl.grupo_id
  WHERE gl.script_id = p_script_id
    AND gm.user_id   = v_user_id
  LIMIT 1;

  IF v_grupo_id IS NULL THEN RETURN; END IF;

  -- Una fila por línea (recording_id): la grabación con mejor score del actor asignado.
  -- Excluye las grabaciones del propio usuario (él ya las tiene en su sesión local).
  RETURN QUERY
  SELECT DISTINCT ON (tr.recording_id)
    tr.recording_id,
    tr.audio_url,
    tr.character_name,
    tr.user_id AS actor_user_id
  FROM public.teleprompter_recordings tr
  JOIN public.grupo_miembros gm
    ON gm.user_id  = tr.user_id
   AND gm.grupo_id = v_grupo_id
  WHERE tr.user_id      != v_user_id
    AND tr.audio_url    IS NOT NULL
    AND tr.recording_id IS NOT NULL
  ORDER BY tr.recording_id, tr.similarity_score DESC NULLS LAST;
END;
$$;
