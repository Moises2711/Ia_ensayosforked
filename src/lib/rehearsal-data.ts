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
  ai_difficulty: 50,
  allow_improv: true,
  avatar_url: null,
  created_at: new Date(0).toISOString(),
  display_name: "Invitado",
  email: null,
  feedback_enabled: true,
  notifications_enabled: true,
  offline_mode_enabled: false,
  preferred_voice: "Sofia (Femenina)",
  privacy_level: "privado",
  rehearsal_mode: "individual",
  suggest_emotions: true,
  updated_at: new Date(0).toISOString(),
  user_id: "guest",
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
    .eq("user_id", user.id)
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
      user_id: user.id,
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
        user_id: user.id,
        email: user.email,
      },
      { onConflict: "user_id" },
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

  return new Map(((data as T[] | null) ?? []).map((item) => [item.id, item]));
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

export async function getScriptSetup(scriptId?: string, sceneId?: string): Promise<ScriptSetup> {
  const scripts = await getScripts();
  const script =
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
  if (parsedLines.length === 0) {
    throw new Error("No se encontraron lineas de dialogo para importar. Verifica el formato del texto.");
  }

  const characterNames = Array.from(
    new Set(parsedLines.map((line) => line.characterName).filter(Boolean)),
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
    // 2. INTENTO DE GUARDAR LA ESCENA
    const { data: scene, error: sceneError } = await supabase
      .from("scenes")
      .insert({
        script_id: script.id,
        title: "Escena importada",
        description: "Escena creada automaticamente al importar el libreto.",
        sort_order: 1,
      })
      .select("*")
      .single();

    if (sceneError) throw new Error(`Supabase Error (scenes): ${sceneError.message}`);

    const insertedCharacters = characterNames.length
      ? await insertCharactersForScript(script.id, characterNames)
      : [];
    const characterByName = new Map(
      insertedCharacters.map((character) => [normalizeName(character.name), character.id]),
    );

    // 3. INTENTO DE GUARDAR LAS LÍNEAS DE DIÁLOGO
    const lines: TablesInsert<"script_lines">[] = parsedLines.map((line, index) => ({
      scene_id: scene.id,
      character_id: line.characterName
        ? (characterByName.get(normalizeName(line.characterName)) ?? null)
        : null,
      line_order: index + 1,
      text: line.text,
      duration_seconds: estimateLineDuration(line.text),
    }));

    const { error: linesError } = await supabase.from("script_lines").insert(lines);
    if (linesError) throw new Error(`Supabase Error (script_lines): ${linesError.message}`);

    return script;
  } catch (error) {
    // Si falla a la mitad, borramos lo que se alcanzó a crear
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

function parseImportedScriptLines(rawText: string): ImportedScriptLine[] {
  const normalizedLines = rawText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: ImportedScriptLine[] = [];
  let currentCharacter: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (text) parsed.push({ characterName: currentCharacter, text });
    buffer = [];
  };

  for (const line of normalizedLines) {
    if (isCharacterCue(line)) {
      flush();
      currentCharacter = cleanCharacterName(line);
      continue;
    }

    buffer.push(line);
  }

  flush();
  return parsed;
}

function isCharacterCue(line: string) {
  const cleaned = cleanCharacterName(line);
  if (!cleaned || cleaned.length > 40) return false;
  if (/^\d+$/.test(cleaned)) return false;
  if (/[.!?¿¡]/.test(cleaned)) return false;
  return cleaned === cleaned.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/i.test(cleaned);
}

function cleanCharacterName(value: string) {
  return value.replace(/[:.-]+$/g, "").trim();
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
  const { data, error } = await supabase
    .from("rehearsal_sessions")
    .select("*")
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
