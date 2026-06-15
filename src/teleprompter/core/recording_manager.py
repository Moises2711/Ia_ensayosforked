"""
recording_manager.py
Simplificado: grabación y reproducción de audio movidas al browser
(MediaRecorder + Web Audio API).
FastAPI ahora solo gestiona IDs de sesión locales y scoring de texto.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class Ensayo:
    id_ensayo: str
    id_obra: str
    modo_ensayo: str
    fecha_hora: str


class RecordingDB:
    """Rastrea sesiones activas en memoria (no escribe en Supabase)."""

    def __init__(self) -> None:
        self._sessions: dict[str, Ensayo] = {}

    def iniciar_ensayo(self, id_obra: str, modo_ensayo: str) -> Ensayo:
        session_id = str(uuid.uuid4())
        ensayo = Ensayo(
            id_ensayo=session_id,
            id_obra=id_obra,
            modo_ensayo=modo_ensayo,
            fecha_hora=datetime.now().isoformat(),
        )
        self._sessions[session_id] = ensayo
        return ensayo

    def get_ensayo(self, id_ensayo: str) -> Optional[Ensayo]:
        return self._sessions.get(id_ensayo)
