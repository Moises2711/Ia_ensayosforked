"""
recording_manager.py
Capa de datos y grabación adaptada al nuevo esquema relacional en Supabase (PostgreSQL).
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional, List

import numpy as np
import pyaudio
import sounddevice as sd
import soundfile as sf
from dotenv import load_dotenv
from supabase import create_client, Client

# Cargar variables del entorno (.env) automáticamente
load_dotenv()

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
class Ensayo:
    id_ensayo: str
    id_obra: str
    modo_ensayo: str
    fecha_hora: str

@dataclass
class Grabacion:
    id_grabacion: str
    id_linea: str
    id_actor: str
    ruta_archivo_audio: str
    es_toma_activa: bool

# (Haz lo mismo para Actor, Obra, Personaje y LineaDialogo si las usas)


# ── Base de datos (Supabase) ──────────────────────────────────────────────────
class RecordingDB:
    def __init__(self):
        # Lee las variables del entorno. Soporta el formato estándar y el de VITE_
        url: str = os.environ.get("SUPABASE_URL") or os.environ.get("VITE_SUPABASE_URL")
        key: str = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
        
        if not url or not key:
            raise ValueError("Faltan credenciales de Supabase en las variables de entorno.")
            
        self.supabase: Client = create_client(url, key)

# ── Métodos CRUD ──────────────────────────────────────────────────────────
    def iniciar_ensayo(self, id_obra: str, modo_ensayo: str) -> Ensayo:
        fecha_hora = datetime.now().isoformat()
        
        data = {
            "id_obra": id_obra,
            "modo_ensayo": modo_ensayo,
            "fecha_hora": fecha_hora
        }
        
        # Tabla en minúsculas
        response = self.supabase.table("ensayo").insert(data).execute()
        
        if not response.data:
            raise Exception("No se pudo crear el ensayo en Supabase")
            
        row = response.data[0]
        return Ensayo(
            id_ensayo=row["id_ensayo"], 
            id_obra=row["id_obra"], 
            modo_ensayo=row["modo_ensayo"], 
            fecha_hora=row["fecha_hora"]
        )

    def get_ensayo(self, id_ensayo: str) -> Optional[Ensayo]:
        response = self.supabase.table("ensayo").select("*").eq("id_ensayo", id_ensayo).execute()
        
        if not response.data:
            return None
            
        row = response.data[0]
        return Ensayo(
            id_ensayo=row["id_ensayo"], 
            id_obra=row["id_obra"], 
            modo_ensayo=row["modo_ensayo"], 
            fecha_hora=row["fecha_hora"]
        )

    def guardar_toma_audio(self, id_linea: str, id_actor: str, ruta_audio: str) -> Grabacion:
        # Desactivar tomas anteriores para esta línea
        self.supabase.table("grabacion").update({"es_toma_activa": False}).eq("id_linea", id_linea).execute()
        
        # Insertar la nueva toma
        data = {
            "id_linea": id_linea,
            "id_actor": id_actor,
            "ruta_archivo_audio": ruta_audio,
            "es_toma_activa": True
        }
        
        response = self.supabase.table("grabacion").insert(data).execute()
        
        if not response.data:
            raise Exception("No se pudo guardar la grabación en Supabase")
            
        row = response.data[0]
        
        return Grabacion(
            id_grabacion=row["id_grabacion"],
            id_linea=row["id_linea"],
            id_actor=row["id_actor"],
            ruta_archivo_audio=row["ruta_archivo_audio"],
            es_toma_activa=row["es_toma_activa"]
        )

    def obtener_grabacion_activa_por_linea(self, id_linea: str) -> Optional[Grabacion]:
        response = self.supabase.table("grabacion").select("*").eq("id_linea", id_linea).eq("es_toma_activa", True).execute()
        
        if not response.data:
            return None
            
        row = response.data[0]
        return Grabacion(
            id_grabacion=row["id_grabacion"],
            id_linea=row["id_linea"],
            id_actor=row["id_actor"],
            ruta_archivo_audio=row["ruta_archivo_audio"],
            es_toma_activa=row["es_toma_activa"]
        )


# ── Grabador de personaje ─────────────────────────────────────────────────────
class CharacterRecorder:
    def __init__(self, db: RecordingDB):
        self.db = db
        self._recording = False
        self._frames: list[np.ndarray] = []
        self._thread: Optional[threading.Thread] = None
        self._stop_evt = threading.Event()
        
        # Estado actual de grabación
        self._id_ensayo: str = ""
        self._id_actor: str = ""
        self._id_linea: str = ""
        self._mic_index: Optional[int] = None

    @property
    def is_recording(self) -> bool:
        return self._recording

    def start_recording(self, id_ensayo: str, id_actor: str, id_linea: str, mic_index: Optional[int] = None):
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

        # Guarda en DB (Supabase) y retorna la nueva toma activa
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