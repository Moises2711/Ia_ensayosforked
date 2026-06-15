-- Bug 4: Los miembros de un grupo pueden leer el script del grupo aunque no lo posean.

-- Paso 1: Si la tabla scripts ya tiene RLS habilitado, agregar política de acceso grupal.
-- (Idempotente: no hace nada si scripts no tiene RLS).
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

-- Paso 2: Función SECURITY DEFINER como respaldo garantizado.
-- Lee el script del grupo directamente (bypasa cualquier RLS en scripts).
-- Verifica internamente que el usuario sea miembro del grupo.
DROP FUNCTION IF EXISTS obtener_script_del_grupo(UUID);
CREATE OR REPLACE FUNCTION obtener_script_del_grupo(p_grupo_id UUID)
RETURNS SETOF public.scripts
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

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
