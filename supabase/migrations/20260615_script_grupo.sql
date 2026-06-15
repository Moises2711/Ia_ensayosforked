-- Bug 2: Los miembros del grupo pueden leer el script del grupo aunque no lo posean.
-- Esta función SECURITY DEFINER bypasa RLS en la tabla scripts.
-- Verifica internamente que auth.uid() sea miembro del grupo antes de devolver datos.

DROP FUNCTION IF EXISTS obtener_script_grupo(UUID);

CREATE OR REPLACE FUNCTION obtener_script_grupo(p_grupo_id UUID)
RETURNS SETOF public.scripts
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  -- Solo devuelve el script si el usuario es miembro del grupo
  RETURN QUERY
  SELECT s.*
  FROM public.scripts s
  JOIN public.grupo_libretos gl ON gl.script_id = s.id
  JOIN public.grupo_miembros gm ON gm.grupo_id = gl.grupo_id
  WHERE gl.grupo_id = p_grupo_id
    AND gm.user_id = auth.uid()
  LIMIT 1;
END;
$$;

-- También aplicar política RLS si la tabla scripts ya la tiene habilitada,
-- para que getScripts() retorne el libreto del grupo directamente.
DO $$
BEGIN
  IF (
    SELECT relrowsecurity
    FROM pg_class
    WHERE relname = 'scripts'
      AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    DROP POLICY IF EXISTS "scripts_grupo_select" ON public.scripts;
    CREATE POLICY "scripts_grupo_select" ON public.scripts FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM public.grupo_libretos gl
        JOIN public.grupo_miembros gm ON gm.grupo_id = gl.grupo_id
        WHERE gl.script_id = scripts.id
          AND gm.user_id = auth.uid()
      )
    );
  END IF;
END;
$$;
