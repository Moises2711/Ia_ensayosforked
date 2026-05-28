"""
recording_manager.py
Capa de datos y grabación adaptada al nuevo esquema relacional SQLite.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional, List

import numpy as np
import pyaudio
import sounddevice as sd
import soundfile as sf

# ── Constantes de audio ───────────────────────────────────────────────────────
SAMPLE_RATE    = 16_000
CHANNELS       = 1
CHUNK_SIZE     = 1_024
RECORDINGS_DIR = Path("recordings")
RECORDINGS_DIR.mkdir(exist_ok=True)


# ── Modelos de datos (Esquema Relacional) ─────────────────────────────────────
@dataclass
class Actor:
    id_actor: int
    nombre: str
    perfil_voz: str
    estilo_interpretativo: str

@dataclass
class Obra:
    id_obra: int
    titulo: str
    texto_guion: str

@dataclass
class Personaje:
    id_personaje: int
    id_obra: int
    nombre: str

@dataclass
class LineaDialogo:
    id_linea: int
    id_personaje: int
    orden_secuencia: int
    texto_esperado: str
    emocion_base: str

@dataclass
class Grabacion:
    id_grabacion: int
    id_linea: int
    id_actor: int
    ruta_archivo_audio: str
    es_toma_activa: bool

@dataclass
class Ensayo:
    id_ensayo: int
    id_obra: int
    modo_ensayo: str
    fecha_hora: str


# ── Base de datos ─────────────────────────────────────────────────────────────
class RecordingDB:
    def __init__(self, db_path: str = "teleprompter.db"):
        self.db_path = db_path
        self._ensure_tables()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = 1") # Activar restricciones de llaves foráneas
        return conn

    def _ensure_tables(self):
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS ACTOR (
                    id_actor INTEGER PRIMARY KEY AUTOINCREMENT,
                    Nombre TEXT NOT NULL,
                    Perfil_voz TEXT,
                    Estilo_interpretativo TEXT
                );

                CREATE TABLE IF NOT EXISTS OBRA (
                    id_obra INTEGER PRIMARY KEY AUTOINCREMENT,
                    Titulo TEXT NOT NULL,
                    Texto_guion TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS PERSONAJE (
                    id_personaje INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_obra INTEGER NOT NULL,
                    Nombre TEXT NOT NULL,
                    FOREIGN KEY (id_obra) REFERENCES OBRA(id_obra)
                );

                CREATE TABLE IF NOT EXISTS ASIGNACION_ROL (
                    id_asignacion INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_actor INTEGER NOT NULL,
                    id_personaje INTEGER NOT NULL,
                    Fecha_registro TEXT NOT NULL,
                    FOREIGN KEY (id_actor) REFERENCES ACTOR(id_actor),
                    FOREIGN KEY (id_personaje) REFERENCES PERSONAJE(id_personaje)
                );

                CREATE TABLE IF NOT EXISTS LINEA_DIALOGO (
                    id_linea INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_personaje INTEGER NOT NULL,
                    Orden_secuencia INTEGER NOT NULL,
                    Texto_esperado TEXT NOT NULL,
                    Emocion_base TEXT,
                    FOREIGN KEY (id_personaje) REFERENCES PERSONAJE(id_personaje)
                );

                CREATE TABLE IF NOT EXISTS GRABACION (
                    id_grabacion INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_linea INTEGER NOT NULL,
                    id_actor INTEGER NOT NULL,
                    Ruta_archivo_audio TEXT NOT NULL,
                    Es_toma_activa BOOLEAN NOT NULL CHECK (Es_toma_activa IN (0, 1)),
                    FOREIGN KEY (id_linea) REFERENCES LINEA_DIALOGO(id_linea),
                    FOREIGN KEY (id_actor) REFERENCES ACTOR(id_actor)
                );

                CREATE TABLE IF NOT EXISTS ENSAYO (
                    id_ensayo INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_obra INTEGER NOT NULL,
                    Modo_ensayo TEXT NOT NULL,
                    Fecha_hora TEXT NOT NULL,
                    FOREIGN KEY (id_obra) REFERENCES OBRA(id_obra)
                );
                """
            )

    # ── Métodos CRUD Básicos ──────────────────────────────────────────────────
    def iniciar_ensayo(self, id_obra: int, modo_ensayo: str) -> Ensayo:
        with self._connect() as conn:
            cursor = conn.execute(
                "INSERT INTO ENSAYO (id_obra, Modo_ensayo, Fecha_hora) VALUES (?, ?, ?)",
                (id_obra, modo_ensayo, datetime.now().isoformat())
            )
            id_ensayo = cursor.lastrowid
            
        return Ensayo(id_ensayo=id_ensayo, id_obra=id_obra, modo_ensayo=modo_ensayo, fecha_hora=datetime.now().isoformat())

    def get_ensayo(self, id_ensayo: int) -> Optional[Ensayo]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM ENSAYO WHERE id_ensayo = ?", (id_ensayo,)).fetchone()
        return Ensayo(**dict(row)) if row else None

    def guardar_toma_audio(self, id_linea: int, id_actor: int, ruta_audio: str) -> Grabacion:
        with self._connect() as conn:
            # Desactivar tomas anteriores para que solo la nueva sea la activa
            conn.execute("UPDATE GRABACION SET Es_toma_activa = 0 WHERE id_linea = ?", (id_linea,))
            
            cursor = conn.execute(
                """
                INSERT INTO GRABACION (id_linea, id_actor, Ruta_archivo_audio, Es_toma_activa)
                VALUES (?, ?, ?, 1)
                """,
                (id_linea, id_actor, ruta_audio)
            )
            id_grabacion = cursor.lastrowid
            
        return Grabacion(id_grabacion=id_grabacion, id_linea=id_linea, id_actor=id_actor, ruta_archivo_audio=ruta_audio, es_toma_activa=True)

    def obtener_grabacion_activa_por_linea(self, id_linea: int) -> Optional[Grabacion]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM GRABACION WHERE id_linea = ? AND Es_toma_activa = 1", 
                (id_linea,)
            ).fetchone()
        return Grabacion(**dict(row)) if row else None


# ── Grabador de personaje ─────────────────────────────────────────────────────
class CharacterRecorder:
    def __init__(self, db: RecordingDB):
        self.db = db
        self._recording = False
        self._frames: list[np.ndarray] = []
        self._thread: Optional[threading.Thread] = None
        self._stop_evt = threading.Event()
        
        # Estado actual de grabación
        self._id_ensayo: int = 0
        self._id_actor: int = 0
        self._id_linea: int = 0
        self._mic_index: Optional[int] = None

    @property
    def is_recording(self) -> bool:
        return self._recording

    def start_recording(self, id_ensayo: int, id_actor: int, id_linea: int, mic_index: Optional[int] = None):
        if self._recording:
            raise RuntimeError("Ya hay una grabación en curso.")
            
        self._id_ensayo = id_ensayo
        self._id_actor = id_actor
        self._id_linea = id_linea
        self._mic_index = mic_index
        self._frames = []
        self._stop_evt.clear()
        self._recording = True
        self._thread = threading.Thread(target=self._record_loop, daemon=True)
        self._thread.start()

    def stop_recording(self) -> Optional[Grabacion]:
        if not self._recording:
            return None
        self._stop_evt.set()
        self._recording = False
        if self._thread:
            self._thread.join(timeout=3)
        if not self._frames:
            return None

        audio = np.concatenate(self._frames)
        # Nomenclatura del archivo de audio con IDs numéricos
        filename = f"ensayo{self._id_ensayo}_actor{self._id_actor}_linea{self._id_linea}.wav"
        audio_path = str(RECORDINGS_DIR / filename)
        sf.write(audio_path, audio, SAMPLE_RATE)

        # Guarda en DB y retorna la nueva toma activa
        return self.db.guardar_toma_audio(id_linea=self._id_linea, id_actor=self._id_actor, ruta_audio=audio_path)

    def _record_loop(self):
        p = pyaudio.PyAudio()
        try:
            stream = p.open(
                format=pyaudio.paFloat32, channels=CHANNELS,
                rate=SAMPLE_RATE, input=True,
                input_device_index=self._mic_index,
                frames_per_buffer=CHUNK_SIZE,
            )
        except Exception as e:
            print(f"[CharacterRecorder] Error: {e}")
            p.terminate()
            self._recording = False
            return

        while not self._stop_evt.is_set():
            try:
                data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
                chunk = np.frombuffer(data, dtype=np.float32)
                self._frames.append(chunk)
            except Exception:
                break

        stream.stop_stream()
        stream.close()
        p.terminate()


# ── Motor de reproducción ─────────────────────────────────────────────────────
class PlaybackEngine:
    def __init__(self):
        self._playing = False
        self._thread: Optional[threading.Thread] = None
        self._stop_evt = threading.Event()
        self.on_start: Optional[Callable[[int], None]] = None
        self.on_finish: Optional[Callable[[int], None]] = None

    @property
    def is_playing(self) -> bool:
        return self._playing

    def play(self, audio_path: str, id_personaje: int = 0):
        self.stop()
        self._stop_evt.clear()
        self._playing = True
        self._thread = threading.Thread(
            target=self._play_loop, args=(audio_path, id_personaje), daemon=True
        )
        self._thread.start()

    def stop(self):
        if self._playing:
            self._stop_evt.set()
            self._playing = False
            if self._thread:
                self._thread.join(timeout=2)

    def _play_loop(self, audio_path: str, id_personaje: int):
        try:
            data, sr = sf.read(audio_path, dtype="float32")
            if self.on_start:
                self.on_start(id_personaje)
            chunk_samples = 1_024
            idx = 0
            with sd.OutputStream(samplerate=sr, channels=1, dtype="float32") as stream:
                while idx < len(data) and not self._stop_evt.is_set():
                    end = min(idx + chunk_samples, len(data))
                    block = data[idx:end]
                    if block.ndim == 1:
                        block = block.reshape(-1, 1)
                    stream.write(block)
                    idx = end
        except Exception as e:
            print(f"[PlaybackEngine] Error: {e}")
        finally:
            self._playing = False
            if self.on_finish:
                self.on_finish(id_personaje)