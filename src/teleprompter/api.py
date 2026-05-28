"""
api.py  –  Backend FastAPI para Whisper Teleprompter (Versión Relacional)
"""

from __future__ import annotations

import asyncio
import os
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from core.teleprompter_engine import WhisperTeleprompter
from core.recording_manager import (
    CharacterRecorder,
    PlaybackEngine,
    RecordingDB,
    RECORDINGS_DIR,
)

DB_PATH       = os.getenv("DB_PATH", "teleprompter.db")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WHISPER_LANG  = os.getenv("WHISPER_LANG", "es")

class AppState:
    def __init__(self):
        self.db       = RecordingDB(DB_PATH)
        self.tp       = WhisperTeleprompter(WHISPER_MODEL, WHISPER_LANG)
        self.recorder = CharacterRecorder(self.db)
        self.playback = PlaybackEngine()

app_state = AppState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    RECORDINGS_DIR.mkdir(exist_ok=True)
    yield
    app_state.tp.audio.stop()
    app_state.playback.stop()

app = FastAPI(title="Whisper Teleprompter API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)
app.mount("/recordings", StaticFiles(directory=str(RECORDINGS_DIR)), name="recordings")


# ════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC ACTUALIZADOS A IDs ENTEROS
# ════════════════════════════════════════════════════════════════════════════

class EnsayoCreate(BaseModel):
    id_obra: int
    modo_ensayo: str

class RecordStart(BaseModel):
    id_ensayo: int
    id_actor: int
    id_linea: int
    mic_index: Optional[int] = None


# ════════════════════════════════════════════════════════════════════════════
# ENDPOINTS (Adaptados)
# ════════════════════════════════════════════════════════════════════════════

@app.post("/ensayo")
async def create_ensayo(body: EnsayoCreate):
    """Inicia una sesión de ensayo vinculada a una obra específica."""
    ensayo = app_state.db.iniciar_ensayo(id_obra=body.id_obra, modo_ensayo=body.modo_ensayo)
    return {
        "id_ensayo": ensayo.id_ensayo,
        "id_obra": ensayo.id_obra,
        "modo_ensayo": ensayo.modo_ensayo,
        "fecha_hora": ensayo.fecha_hora
    }

@app.post("/recording/start")
async def start_recording(body: RecordStart):
    """Inicia grabación para un actor y una línea de diálogo (usando IDs)."""
    if app_state.recorder.is_recording:
        raise HTTPException(409, "Hay una grabación en curso.")
        
    ensayo = app_state.db.get_ensayo(body.id_ensayo)
    if not ensayo:
        raise HTTPException(404, "Ensayo no encontrado.")

    app_state.recorder.start_recording(
        id_ensayo=body.id_ensayo,
        id_actor=body.id_actor,
        id_linea=body.id_linea,
        mic_index=body.mic_index,
    )
    return {"status": "recording", "id_linea": body.id_linea}


@app.post("/recording/stop")
async def stop_recording():
    if not app_state.recorder.is_recording:
        raise HTTPException(409, "No hay grabación activa.")
        
    rec = app_state.recorder.stop_recording()
    if not rec:
        raise HTTPException(500, "Grabación vacía.")
        
    return {
        "id_grabacion": rec.id_grabacion,
        "id_linea": rec.id_linea,
        "id_actor": rec.id_actor,
        "es_toma_activa": rec.es_toma_activa,
        "audio_url": f"/recordings/{Path(rec.ruta_archivo_audio).name}",
    }