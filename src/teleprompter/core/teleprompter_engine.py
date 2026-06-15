"""
teleprompter_engine.py
Utilidades de similitud de texto con SequenceMatcher.
Whisper eliminado — el STT ahora corre en el browser vía Web Speech API.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher


def _normalize(text: str) -> str:
    """Normaliza texto para comparación: minúsculas, sin puntuación extra."""
    return re.sub(r"\s+", " ", text.lower().strip())


def text_similarity(a: str, b: str) -> float:
    """
    Calcula la similitud entre dos cadenas con SequenceMatcher.ratio().
    Retorna un valor entre 0.0 y 1.0.
    """
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, _normalize(a), _normalize(b), autojunk=False).ratio()


def calculate_line_score(transcription: str, expected: str, confidence: float) -> float:
    """
    Score de 0–100 para una línea grabada.
    Pondera similitud textual (70%) + confianza del STT (30%).
    """
    if not transcription or not expected:
        return 0.0
    similarity = text_similarity(transcription, expected)
    score = (similarity * 0.7 + max(0.0, min(1.0, confidence)) * 0.3) * 100
    return round(max(0.0, min(100.0, score)), 1)
