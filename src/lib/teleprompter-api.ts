// src/lib/teleprompter-api.ts

// Asegúrate de haber agregado VITE_TELEPROMPTER_API_URL en tu archivo .env
const API_BASE_URL = import.meta.env.VITE_TELEPROMPTER_API_URL || "http://127.0.0.1:8000";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    throw new Error(errorData?.detail || `API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// 1. Crear un nuevo ensayo
export function createTeleprompterEnsayo({
  idObra,
  modoEnsayo,
}: {
  idObra: number;
  modoEnsayo: string;
}) {
  return request<{ id_ensayo: number; id_obra: number; modo_ensayo: string; fecha_hora: string }>("/ensayo", {
    method: "POST",
    body: JSON.stringify({
      id_obra: idObra,
      modo_ensayo: modoEnsayo,
    }),
  });
}

// 2. Iniciar la grabación
export function startRecording(ensayoId: number) {
  return request<{ message: string; recording_id: number }>("/recording/start", {
    method: "POST",
    body: JSON.stringify({ ensayo_id: ensayoId }),
  });
}

// 3. Detener la grabación
export function stopRecording(recordingId: number) {
  return request<{ message: string; file_path: string }>("/recording/stop", {
    method: "POST",
    body: JSON.stringify({ recording_id: recordingId }),
  });
}