-- Keep perfil_usuario synchronized whenever a row is created in public.profiles.
-- This covers profile creation from auth triggers and any future profile insert/update flow.

CREATE OR REPLACE FUNCTION public.sync_perfil_usuario_from_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_email TEXT;
BEGIN
  SELECT email
  INTO profile_email
  FROM auth.users
  WHERE id = NEW.user_id;

  INSERT INTO public.perfil_usuario (user_id, display_name, email, avatar_url)
  VALUES (
    NEW.user_id,
    NEW.display_name,
    profile_email,
    NEW.avatar_url
  )
  ON CONFLICT (user_id) DO UPDATE
  SET display_name = COALESCE(EXCLUDED.display_name, public.perfil_usuario.display_name),
      email = COALESCE(EXCLUDED.email, public.perfil_usuario.email),
      avatar_url = COALESCE(EXCLUDED.avatar_url, public.perfil_usuario.avatar_url),
      updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_perfil_usuario_from_profile ON public.profiles;

CREATE TRIGGER sync_perfil_usuario_from_profile
AFTER INSERT OR UPDATE OF display_name, avatar_url, user_id
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_perfil_usuario_from_profile();

INSERT INTO public.perfil_usuario (user_id, display_name, email, avatar_url)
SELECT
  profiles.user_id,
  profiles.display_name,
  auth.users.email,
  profiles.avatar_url
FROM public.profiles
JOIN auth.users ON auth.users.id = profiles.user_id
ON CONFLICT (user_id) DO UPDATE
SET display_name = COALESCE(EXCLUDED.display_name, public.perfil_usuario.display_name),
    email = COALESCE(EXCLUDED.email, public.perfil_usuario.email),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.perfil_usuario.avatar_url),
    updated_at = now();

REVOKE ALL ON FUNCTION public.sync_perfil_usuario_from_profile() FROM PUBLIC, anon, authenticated;
