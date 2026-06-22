import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type PerfilUsuarioRecord = Tables<"perfil_usuario">;
export type ScriptRecord = Tables<"scripts">;
export type SceneRecord = Tables<"scenes">;
export type CharacterRecord = Tables<"characters">;
export type ScriptLineRecord = Tables<"script_lines">;
export type RehearsalSessionRecord = Tables<"rehearsal_sessions">;
export type RehearsalHighlightRecord = Tables<"rehearsal_highlights">;
export type TeleprompterRecordingRecord = Tables<"teleprompter_recordings">;

export type ScriptLineWithCharacter = ScriptLineRecord & {
  character: CharacterRecord | null;
};

export type RehearsalSummary = RehearsalSessionRecord & {
  script: ScriptRecord | null;
  scene: SceneRecord | null;
  selectedCharacter: CharacterRecord | null;
};

export type RehearsalReport = RehearsalSummary & {
  highlights: RehearsalHighlightRecord[];
};

export type ScriptSetup = {
  script: ScriptRecord | null;
  scenes: SceneRecord[];
  scene: SceneRecord | null;
  characters: CharacterRecord[];
  lines: ScriptLineWithCharacter[];
};

export type ScriptDetails = {
  scenes: SceneRecord[];
  characters: CharacterRecord[];
  lines: ScriptLineWithCharacter[];
};

export type ImportedScriptLine = {
  characterName: string | null;
  text: string;
  isStageDirection: boolean;
};

export type ScriptImportDraft = {
  title: string;
  author?: string | null;
  genre?: string | null;
  description?: string | null;
  rawText: string;
};

export type RehearsalDraft = {
  scriptId: string;
  sceneId: string;
  selectedCharacterId: string | null;
  mode: string;
  aiDifficulty: number;
  suggestEmotions: boolean;
  allowImprov: boolean;
  feedbackEnabled: boolean;
  totalLines: number;
};

const GUEST_PROFILE: PerfilUsuarioRecord = {
  id_usuario: "guest",
  nombre_usuario: "Invitado",
  foto_perfil: null,
  rol_global: null,
  fecha_registro: null,
  avatar_url: null,
  created_at: new Date(0).toISOString(),
  display_name: "Invitado",
  email: null,
  updated_at: new Date(0).toISOString(),
};

function sortByOrder<T extends { sort_order: number }>(items: T[]) {
  return [...items].sort((a, b) => a.sort_order - b.sort_order);
}

async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) return null;
  return user;
}

export async function getCurrentUserId() {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

export async function getPerfilUsuario() {
  const user = await getCurrentUser();
  if (!user) return { profile: GUEST_PROFILE, isAuthenticated: false };

  const { data, error } = await supabase
    .from("perfil_usuario")
    .select("*")
    .eq("id_usuario", user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return { profile: data, isAuthenticated: true };

  const fallbackName =
    user.user_metadata?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email ??
    "Usuario";

  const { data: created, error: createError } = await supabase
    .from("perfil_usuario")
    .insert({
      id_usuario: user.id,
      nombre_usuario: fallbackName,
      display_name: fallbackName,
      email: user.email,
      avatar_url: user.user_metadata?.avatar_url ?? null,
    })
    .select("*")
    .single();

  if (createError) throw createError;
  return { profile: created, isAuthenticated: true };
}

export async function updatePerfilUsuario(patch: TablesUpdate<"perfil_usuario">) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para guardar tu perfil.");

  const { data, error } = await supabase
    .from("perfil_usuario")
    .upsert(
      {
        ...patch,
        id_usuario: user.id,
        email: user.email,
      },
      { onConflict: "id_usuario" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getScripts(options: { includeDeleted?: boolean } = {}) {
  let query = supabase.from("scripts").select("*").order("updated_at", { ascending: false });

  if (!options.includeDeleted) query = query.is("deleted_at", null);

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

export async function getScenesForScript(scriptId: string) {
  const { data, error } = await supabase
    .from("scenes")
    .select("*")
    .eq("script_id", scriptId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCharactersForScript(scriptId: string) {
  const { data, error } = await supabase
    .from("characters")
    .select("*")
    .eq("script_id", scriptId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function getRowsById<T extends { id: string }>(
  table: "scripts" | "scenes" | "characters",
  ids: string[],
) {
  if (ids.length === 0) return new Map<string, T>();

  const { data, error } = await supabase.from(table).select("*").in("id", ids);
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Map(((data as any as T[]) ?? []).map((item: T) => [item.id, item]));
}

export async function getSceneLines(sceneId: string): Promise<ScriptLineWithCharacter[]> {
  const { data, error } = await supabase
    .from("script_lines")
    .select("*")
    .eq("scene_id", sceneId)
    .order("line_order", { ascending: true });

  if (error) throw error;

  const lines = data ?? [];
  const characterIds = Array.from(
    new Set(lines.map((line) => line.character_id).filter(Boolean)),
  ) as string[];
  const charactersById = await getRowsById<CharacterRecord>("characters", characterIds);

  return lines.map((line) => ({
    ...line,
    character: line.character_id ? (charactersById.get(line.character_id) ?? null) : null,
  }));
}

export async function getScriptSetup(
  scriptId?: string,
  sceneId?: string,
  scriptOverride?: ScriptRecord,
): Promise<ScriptSetup> {
  const scripts = await getScripts();
  // scriptOverride lets callers inject a script not in getScripts() (e.g. another user's group script).
  const script =
    (scriptOverride?.id === scriptId ? scriptOverride : null) ??
    scripts.find((item) => item.id === scriptId) ??
    scripts.find((item) => item.is_active) ??
    scripts[0] ??
    null;

  if (!script) {
    return { script: null, scenes: [], scene: null, characters: [], lines: [] };
  }

  const [scenes, characters] = await Promise.all([
    getScenesForScript(script.id),
    getCharactersForScript(script.id),
  ]);
  const sortedScenes = sortByOrder(scenes);
  const scene = sortedScenes.find((item) => item.id === sceneId) ?? sortedScenes[0] ?? null;
  const lines = scene ? await getSceneLines(scene.id) : [];

  return {
    script,
    scenes: sortedScenes,
    scene,
    characters: sortByOrder(characters),
    lines,
  };
}

export async function getScriptDetails(scriptId: string): Promise<ScriptDetails> {
  const [scenes, characters] = await Promise.all([
    getScenesForScript(scriptId),
    getCharactersForScript(scriptId),
  ]);
  const sortedScenes = sortByOrder(scenes);
  const linesByScene = await Promise.all(sortedScenes.map((scene) => getSceneLines(scene.id)));

  return {
    scenes: sortedScenes,
    characters: sortByOrder(characters),
    lines: linesByScene.flat(),
  };
}

export async function importScriptFromText(draft: ScriptImportDraft) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para importar libretos.");

  const parsedLines = parseImportedScriptLines(draft.rawText);
  const dialogueLines = parsedLines.filter((l) => !l.isStageDirection);
  if (dialogueLines.length === 0) {
    throw new Error("No se encontraron líneas de diálogo para importar. Verifica el formato del texto.");
  }

  const characterNames = Array.from(
    new Set(dialogueLines.map((l) => l.characterName).filter(Boolean)),
  ) as string[];
  const now = new Date().toISOString();

  // 1. INTENTO DE GUARDAR EL LIBRETO
  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .insert({
      user_id: user.id,
      title: draft.title.trim(),
      author: draft.author?.trim() || null,
      genre: draft.genre?.trim() || "Importado",
      description: draft.description?.trim() || "Libreto importado desde archivo.",
      act_count: 1,
      is_public: false,
      is_active: false,
      is_favorite: false,
      raw_text: draft.rawText,
      source_type: "imported",
      imported_at: now,
    })
    .select("*")
    .single();

  // AQUÍ OBLIGAMOS A MOSTRAR EL ERROR REAL DE SUPABASE
  if (scriptError) {
    console.error("Detalle del error en Supabase (Scripts):", scriptError);
    throw new Error(`Supabase Error (scripts): ${scriptError.message || scriptError.details}`);
  }

  try {
    // 2. AGRUPAR LÍNEAS POR ESCENA
    const sceneGroups = groupLinesByScene(parsedLines);

    // 3. PERSONAJES (una sola vez para todo el script)
    const insertedCharacters = characterNames.length
      ? await insertCharactersForScript(script.id, characterNames)
      : [];
    const characterByName = new Map(
      insertedCharacters.map((character) => [normalizeName(character.name), character.id]),
    );

    // 4. CREAR ESCENAS Y LÍNEAS
    for (let s = 0; s < sceneGroups.length; s++) {
      const group = sceneGroups[s];

      const { data: scene, error: sceneError } = await supabase
        .from("scenes")
        .insert({
          script_id: script.id,
          title: group.title,
          sort_order: s + 1,
        })
        .select("*")
        .single();

      if (sceneError) throw new Error(`Supabase Error (scenes): ${sceneError.message}`);

      if (group.lines.length === 0) continue;

      const lines: TablesInsert<"script_lines">[] = group.lines.map((line, index) => ({
        scene_id: scene.id,
        character_id:
          !line.isStageDirection && line.characterName
            ? (characterByName.get(normalizeName(line.characterName)) ?? null)
            : null,
        line_order: index + 1,
        text: line.text,
        duration_seconds: line.isStageDirection ? 0 : estimateLineDuration(line.text),
        cue: line.isStageDirection ? "stage_direction" : null,
      }));

      const { error: linesError } = await supabase.from("script_lines").insert(lines);
      if (linesError) throw new Error(`Supabase Error (script_lines): ${linesError.message}`);
    }

    return script;
  } catch (error) {
    await supabase.from("scripts").delete().eq("id", script.id).eq("user_id", user.id);
    throw error;
  }
}

export async function updateScript(scriptId: string, patch: TablesUpdate<"scripts">) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para editar libretos.");

  const { data, error } = await supabase
    .from("scripts")
    .update(patch)
    .eq("id", scriptId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function toggleScriptFavorite(script: ScriptRecord) {
  return updateScript(script.id, { is_favorite: !script.is_favorite });
}

export async function setActiveScript(script: ScriptRecord) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para activar libretos.");
  if (script.user_id !== user.id) throw new Error("Solo puedes activar tus libretos importados.");

  const { error: clearError } = await supabase
    .from("scripts")
    .update({ is_active: false })
    .eq("user_id", user.id);
  if (clearError) throw clearError;

  return updateScript(script.id, { is_active: true });
}

export async function softDeleteScript(script: ScriptRecord) {
  return updateScript(script.id, { deleted_at: new Date().toISOString(), is_active: false });
}

export async function restoreScript(script: ScriptRecord) {
  return updateScript(script.id, { deleted_at: null });
}

export async function deleteScriptPermanently(script: ScriptRecord) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para eliminar libretos.");

  const { error } = await supabase
    .from("scripts")
    .delete()
    .eq("id", script.id)
    .eq("user_id", user.id);

  if (error) throw error;
}

export async function duplicateScript(scriptId: string) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para duplicar libretos.");

  const bundle = await getScriptBundle(scriptId);
  const { script, scenes, characters, linesByScene } = bundle;

  const { data: copy, error: copyError } = await supabase
    .from("scripts")
    .insert({
      user_id: user.id,
      title: `${script.title} (copia)`,
      author: script.author,
      genre: script.genre,
      act_count: script.act_count,
      description: script.description,
      is_public: false,
      is_active: false,
      is_favorite: false,
      raw_text: script.raw_text,
      source_type: "duplicated",
      imported_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (copyError) throw copyError;

  try {
    const characterIdMap = new Map<string, string>();
    if (characters.length) {
      const copiedCharacters = await insertCharactersForScript(
        copy.id,
        characters.map((character) => character.name),
        characters,
      );
      copiedCharacters.forEach((character, index) => {
        characterIdMap.set(characters[index].id, character.id);
      });
    }

    for (const scene of scenes) {
      const { data: copiedScene, error: sceneError } = await supabase
        .from("scenes")
        .insert({
          script_id: copy.id,
          title: scene.title,
          location: scene.location,
          description: scene.description,
          sort_order: scene.sort_order,
        })
        .select("*")
        .single();

      if (sceneError) throw sceneError;

      const copiedLines = (linesByScene.get(scene.id) ?? []).map((line) => ({
        scene_id: copiedScene.id,
        character_id: line.character_id ? (characterIdMap.get(line.character_id) ?? null) : null,
        line_order: line.line_order,
        text: line.text,
        cue: line.cue,
        duration_seconds: line.duration_seconds,
      }));

      if (copiedLines.length) {
        const { error: linesError } = await supabase.from("script_lines").insert(copiedLines);
        if (linesError) throw linesError;
      }
    }

    return copy;
  } catch (error) {
    await supabase.from("scripts").delete().eq("id", copy.id).eq("user_id", user.id);
    throw error;
  }
}

async function insertCharactersForScript(
  scriptId: string,
  names: string[],
  sourceCharacters?: CharacterRecord[],
) {
  const inserts: TablesInsert<"characters">[] = names.map((name, index) => {
    const source = sourceCharacters?.[index];
    return {
      script_id: scriptId,
      name,
      role: source?.role ?? null,
      actor_type: source?.actor_type ?? (index === 0 ? "user" : "ai"),
      voice: source?.voice ?? null,
      base_emotion: source?.base_emotion ?? "Neutral",
      sort_order: source?.sort_order ?? index + 1,
    };
  });

  const { data, error } = await supabase
    .from("characters")
    .insert(inserts)
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function getScriptBundle(scriptId: string) {
  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .select("*")
    .eq("id", scriptId)
    .single();
  if (scriptError) throw scriptError;

  const [scenes, characters] = await Promise.all([
    getScenesForScript(scriptId),
    getCharactersForScript(scriptId),
  ]);
  const linesByScene = new Map<string, ScriptLineRecord[]>();

  for (const scene of scenes) {
    const { data, error } = await supabase
      .from("script_lines")
      .select("*")
      .eq("scene_id", scene.id)
      .order("line_order", { ascending: true });
    if (error) throw error;
    linesByScene.set(scene.id, data ?? []);
  }

  return {
    script,
    scenes: sortByOrder(scenes),
    characters: sortByOrder(characters),
    linesByScene,
  };
}

// ─── Parser de libretos — sistema de dos pasadas ────────────────────────────

// Solo usado en el fallback heurístico (sin sección Personajes)
const SECTION_HEADER_RE =
  /^(personajes?|lista de personajes|reparto|elenco|escena|acto|lugar|tiempo|nota|descripci[oó]n|obras?|t[ií]tulo|prólogo|prologo|ep[ií]logo|prefacio|introducción|introduccion)\b/i;

const SCRIPT_END_RE =
  /^(fin\.?|f\.?i\.?n\.?|the end\.?|tel[oó]n\.?|fin de la obra\.?|fin del cuento\.?)$/i;

const TRAILING_END_MARKER_RE =
  /\s+(fin|tel[oó]n|the end|fin de la obra|fin del cuento)\.?\s*$/i;

const NON_CHARACTER_WORDS = new Set([
  "a", "al", "con", "de", "del", "e", "el", "en", "entre",
  "i", "la", "las", "le", "les", "lo", "los", "me", "ni", "o", "os",
  "para", "pero", "por", "que", "se", "si", "sin", "sobre", "su",
  "te", "u", "un", "una", "uno", "y", "yo",
  "autor", "autora", "autores", "género", "genero",
  "duración", "duracion", "escrito", "escrita", "adaptación", "adaptacion",
]);

/**
 * PASADA 1 — extrae nombres de personaje de la sección "Personajes:".
 * Devuelve los personajes (Map normalizado→canónico) y el índice de la
 * última línea que pertenece a esa sección (sectionEnd).
 * El límite de la sección se detecta por línea en blanco O por la primera
 * línea que no encaja como "Nombre: descripción" dentro del bloque.
 */
function extractKnownCharacters(lines: string[]): {
  characters: Map<string, string>;
  sectionEnd: number;
} {
  const characters = new Map<string, string>();
  let inSection = false;
  let sectionEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line) {
      if (inSection) inSection = false; // línea en blanco cierra la sección
      continue;
    }

    if (/^(personajes?|lista de personajes|reparto|elenco)\s*:/i.test(line)) {
      inSection = true;
      sectionEnd = i; // el encabezado mismo es parte de la sección
      // Parsear nombres inline: "Personajes: Ana: desc Luis: desc"
      const afterColon = line.slice(line.indexOf(":") + 1).trim();
      if (afterColon) {
        const re = /([A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]*)*):/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(afterColon)) !== null) {
          const name = m[1].trim();
          if (isValidCharacterName(name)) characters.set(normalizeName(name), name);
        }
      }
      continue;
    }

    if (inSection) {
      // Formato "Nombre: descripción"
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0 && colonIdx <= 50) {
        const name = line.slice(0, colonIdx).trim();
        if (isValidCharacterName(name)) {
          characters.set(normalizeName(name), name);
          sectionEnd = i;
          continue;
        }
      }
      // Formato viñeta: "- Ana", "• Bruno", "* Carla", "1. Diego", "1) Eva"
      // También cubre "- Ana: la protagonista"
      const bulletMatch = line.match(/^(?:[•\-\*]|\d+[.)]) *(.+)/);
      if (bulletMatch) {
        const rest = bulletMatch[1].trim();
        const bulletColon = rest.indexOf(":");
        const name = bulletColon > 0 && bulletColon <= 50 ? rest.slice(0, bulletColon).trim() : rest;
        if (isValidCharacterName(name)) {
          characters.set(normalizeName(name), name);
          sectionEnd = i;
          continue;
        }
      }
      // Línea que no encaja como entrada de personaje → la sección terminó
      inSection = false;
    }
  }

  return { characters, sectionEnd };
}

/**
 * PASADA 2A — clasificación estricta cuando se conocen los personajes.
 * Usa el índice de línea para saltar la sección Personajes en lugar de
 * un flag booleano que dependía de líneas en blanco (causa del bug).
 *
 * DIÁLOGO   = línea con índice > sectionEnd Y "PersonajeConocido: texto"
 * ACOTACIÓN = todo lo demás
 */
function parseWithKnownCharacters(
  lines: string[],
  knownChars: Map<string, string>,
  sectionEnd: number,
): ImportedScriptLine[] {
  const result: ImportedScriptLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue; // líneas en blanco: ignorar

    // Sección Personajes → acotación (sabemos exactamente hasta qué índice)
    if (i <= sectionEnd) {
      result.push({ characterName: null, text: line, isStageDirection: true });
      continue;
    }

    // Fuera de la sección: intentar detectar diálogo
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && colonIdx <= 50) {
      const potentialName = line.slice(0, colonIdx).trim();
      const canonical = knownChars.get(normalizeName(potentialName));
      if (canonical) {
        const dialogue = line.slice(colonIdx + 1).trim().replace(TRAILING_END_MARKER_RE, "").trim();
        if (dialogue.length >= 1) {
          result.push({ characterName: canonical, text: dialogue, isStageDirection: false });
          continue;
        }
      }
    }

    // Todo lo demás: acotación escénica
    result.push({ characterName: null, text: line, isStageDirection: true });
  }

  return result.filter((l) => l.text.length > 0);
}

/**
 * PASADA 2B — heurístico de respaldo para guiones sin sección Personajes.
 */
function parseHeuristic(lines: string[]): ImportedScriptLine[] {
  const result: ImportedScriptLine[] = [];
  let currentCharacter: string | null = null;
  let buffer: string[] = [];
  let skipSection = false;

  const flush = () => {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text && currentCharacter) result.push({ characterName: currentCharacter, text, isStageDirection: false });
    buffer = [];
  };

  for (const line of lines) {
    if (!line) { skipSection = false; flush(); continue; }

    if (SCRIPT_END_RE.test(line)) {
      flush();
      result.push({ characterName: null, text: line, isStageDirection: true });
      break;
    }

    if (/^\(.*\)$/.test(line) || /^\[.*\]$/.test(line)) {
      result.push({ characterName: null, text: line, isStageDirection: true });
      continue;
    }

    const colonIdx = line.indexOf(":");
    const beforeColon = colonIdx > 0 ? line.slice(0, colonIdx).trim() : line;

    if (SECTION_HEADER_RE.test(beforeColon)) {
      flush();
      skipSection = true;
      currentCharacter = null;
      buffer = [];
      result.push({ characterName: null, text: line, isStageDirection: true });
      continue;
    }

    if (skipSection) {
      result.push({ characterName: null, text: line, isStageDirection: true });
      continue;
    }

    if (colonIdx > 0 && colonIdx <= 50) {
      const potentialName = line.slice(0, colonIdx).trim();
      const dialogue = line.slice(colonIdx + 1).trim().replace(TRAILING_END_MARKER_RE, "").trim();
      if (dialogue.length >= 5 && isValidCharacterName(potentialName)) {
        flush();
        currentCharacter = potentialName;
        buffer.push(dialogue);
        flush();
        continue;
      }
    }

    if (isCharacterCue(line)) {
      flush();
      currentCharacter = cleanCharacterName(line);
      continue;
    }

    if (currentCharacter) {
      buffer.push(line);
    } else {
      result.push({ characterName: null, text: line, isStageDirection: true });
    }
  }

  flush();
  return result.filter((l) => l.text.length > 0);
}

// Encabezados de escena/acto que dividen el libreto en escenas
const SCENE_HEADER_RE = /^(escena|acto|cuadro)\s+(\d+|[ivxlcdmIVXLCDM]+)\b/i;

/**
 * Agrupa las líneas parseadas en escenas detectando encabezados de acotación
 * ("Escena 1", "Acto 2", "Cuadro I", etc.).
 *
 * - Si no hay encabezados → una sola escena "Escena 1" con todo el contenido.
 * - El preámbulo (título, subtítulo, lista de personajes) se antepone a la
 *   primera escena como acotaciones para que el actor vea el contexto.
 * - El encabezado de escena se usa como título pero NO se incluye en las líneas.
 */
function groupLinesByScene(
  parsedLines: ImportedScriptLine[],
): Array<{ title: string; lines: ImportedScriptLine[] }> {
  const hasHeaders = parsedLines.some(
    (l) => l.isStageDirection && SCENE_HEADER_RE.test(l.text),
  );

  if (!hasHeaders) {
    return [{ title: "Escena 1", lines: parsedLines }];
  }

  const groups: Array<{ title: string; lines: ImportedScriptLine[] }> = [];
  let inPreamble = true;
  const preambleLines: ImportedScriptLine[] = [];
  let currentTitle = "";
  let currentLines: ImportedScriptLine[] = [];

  for (const line of parsedLines) {
    if (line.isStageDirection && SCENE_HEADER_RE.test(line.text)) {
      if (!inPreamble) {
        groups.push({ title: currentTitle, lines: currentLines });
      }
      inPreamble = false;
      currentTitle = line.text.trim();
      currentLines = [];
    } else if (inPreamble) {
      preambleLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  if (!inPreamble) {
    groups.push({ title: currentTitle, lines: currentLines });
  }

  // Anteponer el preámbulo a la primera escena para mostrar el contexto al actor
  if (preambleLines.length > 0 && groups.length > 0) {
    groups[0] = { title: groups[0].title, lines: [...preambleLines, ...groups[0].lines] };
  }

  return groups;
}

/**
 * Punto de entrada. Usa dos pasadas si hay sección Personajes; heurístico si no.
 */
function parseImportedScriptLines(rawText: string): ImportedScriptLine[] {
  const rawLines = rawText.replace(/\r/g, "").split("\n").map((l) => l.trim());

  // ── DEBUG TEMPORAL ────────────────────────────────────────────────────────
  console.log("=== [PARSER DEBUG] rawLines (primeras 40) ===");
  rawLines.slice(0, 40).forEach((l, i) => console.log(`  [${i}] ${JSON.stringify(l)}`));
  // ─────────────────────────────────────────────────────────────────────────

  const { characters: knownCharacters, sectionEnd } = extractKnownCharacters(rawLines);

  // ── DEBUG TEMPORAL ────────────────────────────────────────────────────────
  console.log(`=== [PARSER DEBUG] personajes (pasada 1) | sectionEnd=${sectionEnd} ===`);
  if (knownCharacters.size === 0) {
    console.log("  (ninguno — heurístico)");
  } else {
    knownCharacters.forEach((canonical, normalized) =>
      console.log(`  ${JSON.stringify(normalized)} → ${JSON.stringify(canonical)}`),
    );
  }
  // ─────────────────────────────────────────────────────────────────────────

  const result =
    knownCharacters.size > 0
      ? parseWithKnownCharacters(rawLines, knownCharacters, sectionEnd)
      : parseHeuristic(rawLines);

  // ── DEBUG TEMPORAL ────────────────────────────────────────────────────────
  console.log("=== [PARSER DEBUG] primeras 20 líneas clasificadas ===");
  result.slice(0, 20).forEach((l, i) =>
    console.log(
      `  [${i}] ${l.isStageDirection ? "ACOTACIÓN" : `DIÁLOGO(${l.characterName})`} → ${JSON.stringify(l.text)}`,
    ),
  );
  console.log(
    `  total=${result.length} | diálogos=${result.filter((l) => !l.isStageDirection).length} | acotaciones=${result.filter((l) => l.isStageDirection).length}`,
  );
  // ─────────────────────────────────────────────────────────────────────────

  return result;
}

function isValidCharacterName(name: string): boolean {
  if (!name || name.length > 50) return false;
  if (/[.!?¿¡;,]/.test(name)) return false;
  if (/^\d/.test(name)) return false;
  const words = name.trim().split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  if (words.some((w) => NON_CHARACTER_WORDS.has(w.toLowerCase()))) return false;
  return words.every((w) => /^[A-ZÁÉÍÓÚÑ]/.test(w));
}

function isCharacterCue(line: string): boolean {
  const cleaned = cleanCharacterName(line);
  if (!cleaned || cleaned.length > 50) return false;
  if (/^\d+$/.test(cleaned)) return false;
  if (/[.!?¿¡]/.test(cleaned)) return false;

  // Formato clásico: nombre en MAYÚSCULAS completas en línea propia
  if (cleaned === cleaned.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/i.test(cleaned)) return true;

  // Formato "Nombre:" o "NOMBRE:" — línea que termina en dos puntos, sin diálogo
  if (line.trim().endsWith(":") && isValidCharacterName(cleaned)) return true;

  return false;
}

function cleanCharacterName(value: string): string {
  return value.replace(/[:.\-]+$/g, "").trim();
}

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function estimateLineDuration(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.min(12, Math.round(words / 2.4)));
}

export async function createRehearsalSession(draft: RehearsalDraft) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para sincronizar tu ensayo.");

  const insert: TablesInsert<"rehearsal_sessions"> = {
    user_id: user.id,
    script_id: draft.scriptId,
    scene_id: draft.sceneId,
    selected_character_id: draft.selectedCharacterId,
    status: "active",
    mode: draft.mode,
    ai_difficulty: draft.aiDifficulty,
    suggest_emotions: draft.suggestEmotions,
    allow_improv: draft.allowImprov,
    feedback_enabled: draft.feedbackEnabled,
    total_lines: draft.totalLines,
  };

  const { data, error } = await supabase
    .from("rehearsal_sessions")
    .insert(insert)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRehearsalSession(
  sessionId: string,
  patch: TablesUpdate<"rehearsal_sessions">,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para sincronizar tu ensayo.");

  const { data, error } = await supabase
    .from("rehearsal_sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function createTeleprompterRecording(
  recording: Omit<TablesInsert<"teleprompter_recordings">, "user_id">,
) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para guardar la grabacion.");

  const { data, error } = await supabase
    .from("teleprompter_recordings")
    .insert({ ...recording, user_id: user.id })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function getRecentRehearsals(limit = 3): Promise<RehearsalSummary[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("rehearsal_sessions")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return hydrateRehearsals(data ?? []);
}

export async function getLatestRehearsal(): Promise<RehearsalReport | null> {
  const summaries = await getRecentRehearsals(1);
  const latest = summaries[0] ?? null;
  if (!latest) return null;

  const { data, error } = await supabase
    .from("rehearsal_highlights")
    .select("*")
    .eq("session_id", latest.id)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return {
    ...latest,
    highlights: data ?? [],
  };
}

async function hydrateRehearsals(sessions: RehearsalSessionRecord[]): Promise<RehearsalSummary[]> {
  const scriptIds = Array.from(
    new Set(sessions.map((session) => session.script_id).filter(Boolean)),
  ) as string[];
  const sceneIds = Array.from(
    new Set(sessions.map((session) => session.scene_id).filter(Boolean)),
  ) as string[];
  const characterIds = Array.from(
    new Set(sessions.map((session) => session.selected_character_id).filter(Boolean)),
  ) as string[];

  const [scriptsById, scenesById, charactersById] = await Promise.all([
    getRowsById<ScriptRecord>("scripts", scriptIds),
    getRowsById<SceneRecord>("scenes", sceneIds),
    getRowsById<CharacterRecord>("characters", characterIds),
  ]);

  return sessions.map((session) => ({
    ...session,
    script: session.script_id ? (scriptsById.get(session.script_id) ?? null) : null,
    scene: session.scene_id ? (scenesById.get(session.scene_id) ?? null) : null,
    selectedCharacter: session.selected_character_id
      ? (charactersById.get(session.selected_character_id) ?? null)
      : null,
  }));
}

// ── Tipo extendido con scores (columnas añadidas en migración) ─────────────────
export type TeleprompterRecordingWithScore = TeleprompterRecordingRecord & {
  similarity_score: number | null;
  confidence_score: number | null;
  transcription: string | null;
};

// ── Subir audio a Supabase Storage ────────────────────────────────────────────
export async function uploadAudioToStorage(
  blob: Blob,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("rehearsal-audio")
    .upload(path, blob, { upsert: true, contentType: blob.type || "audio/webm" });

  if (error) {
    console.error("[Storage] Error subiendo audio:", error.message);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("rehearsal-audio")
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

// ── Grabaciones de una sesión ─────────────────────────────────────────────────
export async function getSessionRecordings(
  rehearsalSessionId: string,
): Promise<TeleprompterRecordingWithScore[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("teleprompter_recordings")
    .select("*")
    .eq("rehearsal_session_id", rehearsalSessionId)
    .eq("user_id", user.id)
    .order("segment_index", { ascending: true });

  if (error) throw error;
  return (data ?? []) as TeleprompterRecordingWithScore[];
}

// ── Guardar o actualizar grabación de una línea ───────────────────────────────
export async function saveLineRecording({
  rehearsalSessionId,
  teleprompterSessionId,
  lineId,
  characterName,
  segmentIndex,
  transcription,
  audioUrl,
  similarityScore,
  confidenceScore,
  durationSec,
}: {
  rehearsalSessionId: string;
  teleprompterSessionId: string;
  lineId: string;
  characterName: string;
  segmentIndex: number;
  transcription: string;
  audioUrl: string | null;
  similarityScore: number;
  confidenceScore: number;
  durationSec?: number;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Inicia sesion para guardar la grabacion.");

  // Buscar si ya existe una toma para esta línea
  const { data: existing } = await supabase
    .from("teleprompter_recordings")
    .select("id")
    .eq("rehearsal_session_id", rehearsalSessionId)
    .eq("recording_id", lineId)
    .maybeSingle();

  const payload = {
    segment_text: transcription,
    audio_url: audioUrl,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    similarity_score: similarityScore as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    confidence_score: confidenceScore as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transcription: transcription as any,
    duration_sec: durationSec ?? null,
  };

  if (existing?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("teleprompter_recordings")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("teleprompter_recordings")
    .insert({
      user_id: user.id,
      rehearsal_session_id: rehearsalSessionId,
      teleprompter_session_id: teleprompterSessionId,
      recording_id: lineId,
      character_name: characterName,
      segment_index: segmentIndex,
      ...payload,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

// ── Actualizar personaje (actor_type, voice, etc.) ────────────────────────────
export async function updateCharacter(
  characterId: string,
  patch: TablesUpdate<"characters">,
) {
  const { data, error } = await supabase
    .from("characters")
    .update(patch)
    .eq("id", characterId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── Agregar personaje a un libreto ────────────────────────────────────────────
export async function addCharacterToScript(
  scriptId: string,
  name: string,
  actorType: "user" | "ai",
  currentCount: number,
) {
  const { data, error } = await supabase
    .from("characters")
    .insert({
      script_id: scriptId,
      name: name.trim(),
      actor_type: actorType,
      sort_order: currentCount + 1,
      base_emotion: "Neutral",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export function formatActCount(count: number) {
  return `${count} ${count === 1 ? "acto" : "actos"}`;
}

export function formatDuration(start: string, end: string | null) {
  if (!end) return "En curso";

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return "Sin duracion";

  const totalSeconds = Math.round((endMs - startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatScore(score: number | null) {
  return typeof score === "number" ? `${score}%` : "Sin puntuar";
}

export function formatRelativeDate(value: string | null) {
  if (!value) return "sin fecha";

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return "sin fecha";

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000));
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);

  if (diffMinutes < 60) return "hace unos minutos";
  if (diffHours < 24) return diffHours === 1 ? "hace 1 hora" : `hace ${diffHours} horas`;
  if (diffDays === 1) return "ayer";
  if (diffDays < 7) return `hace ${diffDays} dias`;
  if (diffDays < 14) return "la semana pasada";
  return `hace ${Math.round(diffDays / 7)} semanas`;
}
