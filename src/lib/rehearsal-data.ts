import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type PerfilUsuarioRecord = Tables<"perfil_usuario">;
export type ScriptRecord = Tables<"scripts">;
export type SceneRecord = Tables<"scenes">;
export type CharacterRecord = Tables<"characters">;
export type ScriptLineRecord = Tables<"script_lines">;
export type RehearsalSessionRecord = Tables<"rehearsal_sessions">;
export type RehearsalHighlightRecord = Tables<"rehearsal_highlights">;

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

export async function getScripts() {
  const { data, error } = await supabase
    .from("scripts")
    .select("*")
    .order("updated_at", { ascending: false });

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

  return {
    scenes: sortByOrder(scenes),
    characters: sortByOrder(characters),
  };
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
