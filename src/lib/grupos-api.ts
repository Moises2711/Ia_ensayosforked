import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  getCurrentUserId,
  type ScriptDetails,
  type SceneRecord,
  type ScriptLineRecord,
  type ScriptLineWithCharacter,
} from "@/lib/rehearsal-data";

export type GrupoRecord = Tables<"grupos">;
export type GrupoMiembroRecord = Tables<"grupo_miembros">;
export type GrupoLibretoRecord = Tables<"grupo_libretos">;
export type GrupoAnuncioRecord = Tables<"grupo_anuncios">;

export type GrupoConRol = GrupoRecord & { miRol: "admin" | "miembro" };

export type MiembroConPerfil = GrupoMiembroRecord & {
  perfil: {
    id_usuario: string;
    nombre_usuario: string | null;
    display_name: string | null;
    email: string | null;
  } | null;
};

export type LibretoDelGrupo = GrupoLibretoRecord & {
  script: { id: string; title: string; author: string | null } | null;
};

export type AnuncioConAutor = GrupoAnuncioRecord & {
  perfil: {
    id_usuario: string;
    nombre_usuario: string | null;
    display_name: string | null;
  } | null;
};

export type GrupoDetalle = {
  grupo: GrupoRecord;
  miRol: "admin" | "miembro";
  miembros: MiembroConPerfil[];
  libretos: LibretoDelGrupo[];
  characters: Tables<"characters">[];
  anuncios: AnuncioConAutor[];
};

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generarCodigo(): string {
  return Array.from({ length: 10 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
}

export async function crearGrupo(
  nombre: string,
  maxMiembros: number,
  codigoPersonalizado?: string,
): Promise<GrupoRecord> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Debes iniciar sesión para crear un grupo.");

  const codigo = codigoPersonalizado?.trim().toUpperCase() || generarCodigo();

  const { data: grupo, error } = await supabase
    .from("grupos")
    .insert({ nombre: nombre.trim(), creado_por: userId, max_miembros: maxMiembros, codigo_invitacion: codigo })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("Ese código de invitación ya existe. Usa otro.");
    throw error;
  }

  await supabase
    .from("grupo_miembros")
    .insert({ grupo_id: grupo.id, user_id: userId, rol: "admin" });

  return grupo;
}

export async function unirseAGrupo(codigo: string): Promise<GrupoRecord> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Debes iniciar sesión para unirte a un grupo.");

  // La búsqueda usa SECURITY DEFINER para saltarse RLS —
  // un usuario sin membresía aún no puede ver el grupo con SELECT normal.
  const { data: rows, error: grupoError } = await supabase
    .rpc("buscar_grupo_por_codigo", { p_codigo: codigo.trim().toUpperCase() });

  if (grupoError) throw grupoError;
  const grupo = (rows as GrupoRecord[] | null)?.[0] ?? null;
  if (!grupo) throw new Error("Código incorrecto o grupo no encontrado.");

  // SELECT directo devolvería solo la fila propia por RLS; usamos SECURITY DEFINER.
  const { data: countData } = await supabase
    .rpc("contar_miembros_grupo", { p_grupo_id: grupo.id });
  const totalMiembros = (countData as number | null) ?? 0;

  if (totalMiembros >= grupo.max_miembros) throw new Error("El grupo ya está lleno.");

  const { error } = await supabase
    .from("grupo_miembros")
    .insert({ grupo_id: grupo.id, user_id: userId, rol: "miembro" });

  if (error) {
    if (error.code === "23505") throw new Error("Ya eres miembro de este grupo.");
    throw error;
  }

  return grupo;
}

export async function getMisGrupos(): Promise<GrupoConRol[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("grupo_miembros")
    .select("rol, grupos(*)")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.grupos !== null)
    .map((row) => ({
      ...(row.grupos as GrupoRecord),
      miRol: row.rol as "admin" | "miembro",
    }));
}

export async function getGrupoDetalle(grupoId: string): Promise<GrupoDetalle> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No autenticado.");

  // Todas las consultas de datos propios del grupo usan SECURITY DEFINER
  // para evitar que RLS bloquee a miembros que no son dueños de los scripts.
  const [grupoRes, miembrosRes, libretosRes, personajesRes, anunciosRes] = await Promise.all([
    supabase.from("grupos").select("*").eq("id", grupoId).single(),
    supabase.rpc("obtener_miembros_grupo", { p_grupo_id: grupoId }),
    supabase.rpc("obtener_libretos_grupo", { p_grupo_id: grupoId }),
    supabase.rpc("obtener_personajes_grupo", { p_grupo_id: grupoId }),
    supabase.from("grupo_anuncios").select("*").eq("grupo_id", grupoId).order("created_at", { ascending: false }),
  ]);

  if (grupoRes.error) throw grupoRes.error;

  type MiembroRaw = GrupoMiembroRecord & {
    display_name: string | null;
    nombre_usuario: string | null;
    email: string | null;
  };
  type LibretoRaw = {
    id: string;
    grupo_id: string;
    script_id: string;
    added_at: string;
    script_title: string | null;
    script_author: string | null;
  };

  const miembrosRaw = (miembrosRes.data ?? []) as MiembroRaw[];
  const libretosRaw = (libretosRes.data ?? []) as LibretoRaw[];
  const characters = (personajesRes.data ?? []) as Tables<"characters">[];
  const anuncios = anunciosRes.data ?? [];

  // Los autores de anuncios siempre son miembros del grupo, así que sus
  // perfiles ya vienen en miembrosRaw (obtener_miembros_grupo con JOIN).
  // Usar un mapa evita un SELECT separado a perfil_usuario que RLS bloquea
  // cuando el autor es otro usuario.
  const miembrosMap = new Map(miembrosRaw.map((m) => [m.user_id, m]));

  return {
    grupo: grupoRes.data,
    miRol: (miembrosRaw.find((m) => m.user_id === userId)?.rol as "admin" | "miembro") ?? "miembro",
    miembros: miembrosRaw.map((m) => ({
      id: m.id,
      grupo_id: m.grupo_id,
      user_id: m.user_id,
      rol: m.rol,
      personaje_id: m.personaje_id,
      joined_at: m.joined_at,
      perfil: {
        id_usuario: m.user_id,
        display_name: m.display_name,
        nombre_usuario: m.nombre_usuario,
        email: m.email,
      },
    })),
    libretos: libretosRaw.map((l) => ({
      id: l.id,
      grupo_id: l.grupo_id,
      script_id: l.script_id,
      added_at: l.added_at,
      script: l.script_title
        ? { id: l.script_id, title: l.script_title, author: l.script_author }
        : null,
    })),
    characters,
    anuncios: anuncios.map((a) => {
      const autor = miembrosMap.get(a.user_id);
      return {
        ...a,
        perfil: autor
          ? {
              id_usuario: a.user_id,
              display_name: autor.display_name,
              nombre_usuario: autor.nombre_usuario,
            }
          : null,
      };
    }),
  };
}

export async function eliminarGrupo(grupoId: string): Promise<void> {
  const { error } = await supabase.from("grupos").delete().eq("id", grupoId);
  if (error) throw error;
}

export async function salirDeGrupo(grupoId: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No autenticado.");
  const { error } = await supabase
    .from("grupo_miembros")
    .delete()
    .eq("grupo_id", grupoId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function eliminarMiembro(grupoId: string, miembroUserId: string): Promise<void> {
  const { error } = await supabase.rpc("expulsar_miembro", {
    p_grupo_id: grupoId,
    p_user_id: miembroUserId,
  });
  if (error) throw new Error(error.message);
}

export async function asignarPersonaje(
  grupoId: string,
  miembroUserId: string,
  personajeId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc("asignar_personaje_admin", {
    p_grupo_id: grupoId,
    p_user_id: miembroUserId,
    p_personaje_id: personajeId,
  });
  if (error) throw new Error(error.message);
}

export async function addLibretoAlGrupo(grupoId: string, scriptId: string): Promise<void> {
  const { error } = await supabase
    .from("grupo_libretos")
    .insert({ grupo_id: grupoId, script_id: scriptId });
  if (error) {
    if (error.code === "23505") throw new Error("Ese libreto ya está en el grupo.");
    throw error;
  }
}

export async function reemplazarLibreto(grupoId: string, scriptId: string): Promise<void> {
  const { error } = await supabase.rpc("reemplazar_libreto_grupo", {
    p_grupo_id: grupoId,
    p_script_id: scriptId,
  });
  if (error) throw new Error(error.message);
}

export async function removeLibretoDelGrupo(grupoId: string, scriptId: string): Promise<void> {
  const { error } = await supabase
    .from("grupo_libretos")
    .delete()
    .eq("grupo_id", grupoId)
    .eq("script_id", scriptId);
  if (error) throw error;
}

export async function publicarAnuncio(grupoId: string, contenido: string): Promise<GrupoAnuncioRecord> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("No autenticado.");
  const { data, error } = await supabase
    .from("grupo_anuncios")
    .insert({ grupo_id: grupoId, user_id: userId, contenido: contenido.trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function eliminarAnuncio(anuncioId: string): Promise<void> {
  const { error } = await supabase.from("grupo_anuncios").delete().eq("id", anuncioId);
  if (error) throw error;
}

export function nombreMiembro(perfil: MiembroConPerfil["perfil"]): string {
  return perfil?.display_name || perfil?.nombre_usuario || perfil?.email || "Usuario";
}

export function formatGrupoDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

// Actor asignado a un personaje dentro del grupo
export type GrupoAsignacion = {
  userId: string;
  displayName: string;
};

export type GrupoParaScript = {
  grupoId: string;
  personajeId: string | null;
  rol: "admin" | "miembro";
  // Mapa { [personajeId]: actor asignado } — incluye todos los miembros, no solo el usuario actual
  asignaciones: Record<string, GrupoAsignacion>;
};

// Detecta si un script pertenece a un grupo del que el usuario es miembro.
// Devuelve el rol, el personaje asignado al usuario actual, y las asignaciones de todos los miembros.
export async function getGrupoParaScript(scriptId: string): Promise<GrupoParaScript | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  // grupo_libretos RLS: solo muestra filas de grupos donde el usuario es miembro
  const { data: libretos } = await supabase
    .from("grupo_libretos")
    .select("grupo_id")
    .eq("script_id", scriptId);

  if (!libretos?.length) return null;
  const grupoId = libretos[0].grupo_id;

  // Cargar la fila propia y todos los miembros en paralelo
  const [miembroRes, miembrosRes] = await Promise.all([
    supabase
      .from("grupo_miembros")
      .select("personaje_id, rol")
      .eq("grupo_id", grupoId)
      .eq("user_id", userId)
      .maybeSingle(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc("obtener_miembros_grupo", { p_grupo_id: grupoId }),
  ]);

  type MiembroRaw = {
    user_id: string;
    personaje_id: string | null;
    display_name: string | null;
    nombre_usuario: string | null;
    email: string | null;
  };

  const asignaciones: Record<string, GrupoAsignacion> = {};
  for (const m of ((miembrosRes.data ?? []) as MiembroRaw[])) {
    if (m.personaje_id) {
      asignaciones[m.personaje_id] = {
        userId: m.user_id,
        displayName: m.display_name || m.nombre_usuario || m.email || "Actor",
      };
    }
  }

  return {
    grupoId,
    personajeId: miembroRes.data?.personaje_id ?? null,
    rol: (miembroRes.data?.rol as "admin" | "miembro") ?? "miembro",
    asignaciones,
  };
}

// Obtiene el script asignado a un grupo usando SECURITY DEFINER (obtener_script_grupo),
// bypassando cualquier RLS en la tabla scripts. Verifica que el caller sea miembro.
export async function getScriptDelGrupo(grupoId: string): Promise<Tables<"scripts"> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("obtener_script_grupo", {
    p_grupo_id: grupoId,
  });
  if (error || !data?.length) return null;
  return (data[0] as Tables<"scripts">) ?? null;
}

export type ScriptDeGrupo = Tables<"scripts"> & {
  fromGrupoId: string;
  fromGrupoNombre: string;
};

// Devuelve los scripts de todos los grupos del usuario (via SECURITY DEFINER),
// útil para mostrarlos en la sección Libretos junto a los propios.
export async function getScriptsDeGrupos(): Promise<ScriptDeGrupo[]> {
  const grupos = await getMisGrupos();
  const results: ScriptDeGrupo[] = [];
  await Promise.all(
    grupos.map(async (grupo) => {
      const script = await getScriptDelGrupo(grupo.id);
      if (script) {
        results.push({ ...script, fromGrupoId: grupo.id, fromGrupoNombre: grupo.nombre });
      }
    }),
  );
  return results;
}

// Carga personajes, escenas y líneas de un script de grupo usando funciones
// SECURITY DEFINER que bypasan el RLS de scripts ajenos.
export async function getScriptDetailsForGrupo(
  scriptId: string,
  grupoId: string,
): Promise<ScriptDetails> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const [charsRes, scenesRes, linesRes] = await Promise.all([
    s.rpc("obtener_personajes_grupo", { p_grupo_id: grupoId }),
    s.rpc("obtener_escenas_grupo",    { p_grupo_id: grupoId }),
    s.rpc("obtener_lineas_grupo",     { p_grupo_id: grupoId }),
  ]);

  const characters = ((charsRes.data ?? []) as Tables<"characters">[])
    .filter((c) => c.script_id === scriptId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const scenes = ((scenesRes.data ?? []) as SceneRecord[])
    .filter((sc) => sc.script_id === scriptId)
    .sort((a, b) => a.sort_order - b.sort_order);

  const sceneIds = new Set(scenes.map((sc) => sc.id));
  const characterMap = new Map(characters.map((c) => [c.id, c]));
  const lines: ScriptLineWithCharacter[] = ((linesRes.data ?? []) as ScriptLineRecord[])
    .filter((l) => sceneIds.has(l.scene_id))
    .map((l) => ({
      ...l,
      character: l.character_id ? (characterMap.get(l.character_id) ?? null) : null,
    }));

  return { scenes, characters, lines };
}

// Obtiene las grabaciones de otros actores del grupo para el script dado.
// Devuelve un mapa { [recording_id / line_id]: audio_url } listo para usar en ensayo.tsx.
export async function getGrabacionesGrupo(
  scriptId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc("obtener_grabaciones_grupo", {
    p_script_id: scriptId,
  });
  if (error || !data) return {};

  const urls: Record<string, string> = {};
  for (const row of data as { recording_id: string; audio_url: string }[]) {
    if (row.recording_id && row.audio_url) {
      urls[row.recording_id] = row.audio_url;
    }
  }
  return urls;
}
