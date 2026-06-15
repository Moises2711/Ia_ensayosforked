-- Grupos: salas de ensayo colaborativo

CREATE TABLE IF NOT EXISTS public.grupos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigo_invitacion TEXT UNIQUE NOT NULL,
  creado_por UUID NOT NULL,
  max_miembros INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grupo_miembros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rol TEXT NOT NULL DEFAULT 'miembro' CHECK (rol IN ('admin', 'miembro')),
  personaje_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(grupo_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.grupo_libretos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(grupo_id, script_id)
);

CREATE TABLE IF NOT EXISTS public.grupo_anuncios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id UUID NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  contenido TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_miembros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_libretos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grupo_anuncios ENABLE ROW LEVEL SECURITY;

-- ── grupos ───────────────────────────────────────────────────────────────────
-- grupos → grupo_miembros (un solo sentido, sin ciclos)

CREATE POLICY "grupos_select" ON public.grupos FOR SELECT USING (
  creado_por = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.grupo_miembros
    WHERE grupo_id = grupos.id AND user_id = auth.uid()
  )
);
CREATE POLICY "grupos_insert" ON public.grupos FOR INSERT
  WITH CHECK (creado_por = auth.uid());
CREATE POLICY "grupos_update" ON public.grupos FOR UPDATE
  USING (creado_por = auth.uid());
CREATE POLICY "grupos_delete" ON public.grupos FOR DELETE
  USING (creado_por = auth.uid());

-- ── grupo_miembros ───────────────────────────────────────────────────────────
-- NUNCA referencia la tabla grupos; admin se verifica con auto-join
-- (Postgres no aplica RLS recursivamente en auto-joins de políticas)

CREATE POLICY "miembros_select" ON public.grupo_miembros
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "miembros_insert" ON public.grupo_miembros
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "miembros_update" ON public.grupo_miembros
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "miembros_delete" ON public.grupo_miembros
  FOR DELETE USING (user_id = auth.uid());

-- ── grupo_libretos ───────────────────────────────────────────────────────────
-- Admin verificado via grupo_miembros, nunca via grupos

CREATE POLICY "libretos_select" ON public.grupo_libretos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.grupo_miembros
    WHERE grupo_id = grupo_libretos.grupo_id AND user_id = auth.uid()
  )
);
CREATE POLICY "libretos_insert" ON public.grupo_libretos FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.grupo_miembros
    WHERE grupo_id = grupo_libretos.grupo_id
      AND user_id  = auth.uid()
      AND rol      = 'admin'
  )
);
CREATE POLICY "libretos_delete" ON public.grupo_libretos FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.grupo_miembros
    WHERE grupo_id = grupo_libretos.grupo_id
      AND user_id  = auth.uid()
      AND rol      = 'admin'
  )
);

-- ── grupo_anuncios ───────────────────────────────────────────────────────────

CREATE POLICY "anuncios_select" ON public.grupo_anuncios FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.grupo_miembros
    WHERE grupo_id = grupo_anuncios.grupo_id AND user_id = auth.uid()
  )
);
CREATE POLICY "anuncios_insert" ON public.grupo_anuncios FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.grupo_miembros
    WHERE grupo_id = grupo_anuncios.grupo_id
      AND user_id  = auth.uid()
      AND rol      = 'admin'
  )
);
CREATE POLICY "anuncios_delete" ON public.grupo_anuncios FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.grupo_miembros
    WHERE grupo_id = grupo_anuncios.grupo_id
      AND user_id  = auth.uid()
      AND rol      = 'admin'
  )
);
