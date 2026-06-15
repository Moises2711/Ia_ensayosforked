"""
api.py – Backend FastAPI para Cine Estrella
Responsabilidades:
  - /ensayo  → Genera un ID de sesión local (sin tocar Supabase)
  - /score   → Calcula similitud texto con SequenceMatcher (Python)
  - /health  → Healthcheck
Grabación y reproducción de audio: ahora en el browser (MediaRecorder + Web Audio).
Whisper eliminado: STT corre en el browser vía Web Speech API.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.teleprompter_engine import calculate_line_score, text_similarity
from core.recording_manager import RecordingDB


class AppState:
    def __init__(self) -> None:
        self.db = RecordingDB()


app_state = AppState()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    yield


app = FastAPI(title="Cine Estrella API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Modelos Pydantic ──────────────────────────────────────────────────────────

class EnsayoCreate(BaseModel):
    id_obra: str
    modo_ensayo: str


class ScoreRequest(BaseModel):
    transcription: str
    expected_text: str
    confidence: float = 0.8


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ensayo")
async def create_ensayo(body: EnsayoCreate):
    """Crea una sesión de ensayo con ID único local (no persiste en Supabase)."""
    ensayo = app_state.db.iniciar_ensayo(
        id_obra=body.id_obra,
        modo_ensayo=body.modo_ensayo,
    )
    return {
        "id_ensayo": ensayo.id_ensayo,
        "id_obra": ensayo.id_obra,
        "modo_ensayo": ensayo.modo_ensayo,
        "fecha_hora": ensayo.fecha_hora,
    }


@app.post("/score")
async def calculate_score(body: ScoreRequest):
    """
    Calcula la similitud entre la transcripción del usuario y el texto esperado.
    Usa SequenceMatcher de Python para una métrica robusta en español.
    """
    score = calculate_line_score(
        transcription=body.transcription,
        expected=body.expected_text,
        confidence=body.confidence,
    )
    similarity = text_similarity(body.transcription, body.expected_text)
    return {
        "score": score,
        "similarity": round(similarity, 4),
        "confidence": body.confidence,
    }
