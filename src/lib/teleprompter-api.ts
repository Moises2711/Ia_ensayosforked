const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

export function teleprompterApiUrl(path = "") {
  const configured = import.meta.env.VITE_TELEPROMPTER_API_URL ?? DEFAULT_BASE_URL;
  const base = String(configured).replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(teleprompterApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Teleprompter API respondió ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function createTeleprompterEnsayo({
  idObra,
  modoEnsayo,
}: {
  idObra: string;
  modoEnsayo: string;
}) {
  return request<{ id_ensayo: string; id_obra: string; modo_ensayo: string; fecha_hora: string }>("/ensayo", {
    method: "POST",
    body: JSON.stringify({
      id_obra: idObra,
      modo_ensayo: modoEnsayo,
    }),
  });
}

export function startRecording({
  idEnsayo,
  idActor,
  idLinea,
  micIndex,
}: {
  idEnsayo: string;
  idActor: string;
  idLinea: string;
  micIndex?: number;
}) {
  return request<{ status: string; id_linea: string }>("/recording/start", {
    method: "POST",
    body: JSON.stringify({
      id_ensayo: idEnsayo,
      id_actor: idActor,
      id_linea: idLinea,
      mic_index: micIndex ?? null
    }),
  });
}

export function stopRecording() {
  return request<{ id_grabacion: string; id_linea: string; id_actor: string; es_toma_activa: boolean; audio_url: string }>("/recording/stop", {
    method: "POST",
  });
}