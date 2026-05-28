"""
teleprompter_engine.py
Lógica central del Teleprompter: AudioProcessor + WhisperTeleprompter
(sin dependencias de UI – Tkinter o web)
"""

from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import sys
import threading
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Callable, Optional, Tuple

import numpy as np
import torch
import whisper
import pyaudio
from paddleocr import PaddleOCR

# ── Dispositivo ──────────────────────────────────────────────────────────────
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


# ── AudioProcessor ────────────────────────────────────────────────────────────
class AudioProcessor:
    SAMPLE_RATE    = 16_000
    CHUNK_SIZE     = 1_024
    VAD_THRESHOLD  = 0.015
    SILENCE_SEC    = 0.5
    MIN_SPEECH_SEC = 0.4
    MAX_SPEECH_SEC = 1.0

    def __init__(self):
        self.is_running  = False
        self.is_speaking = False
        self.speech_queue: queue.Queue[np.ndarray] = queue.Queue()
        self.device_index: Optional[int] = None

    # ── Enumeración de micrófonos ─────────────────────────────────────────────
    @staticmethod
    def get_microphones() -> dict[str, int]:
        p = pyaudio.PyAudio()
        mics: dict[str, int] = {}
        try:
            default_info  = p.get_default_input_device_info()
            default_index = default_info.get("index") if default_info else None
        except Exception:
            default_index = None

        for i in range(p.get_device_count()):
            info = p.get_device_info_by_index(i)
            if info.get("maxInputChannels", 0) > 0:
                name         = str(info.get("name", f"Dispositivo {i}"))
                display_name = f"{i}: {name}"
                if i == default_index:
                    display_name += " (Predeterminado)"
                mics[display_name] = i
        p.terminate()
        return mics

    # ── Inicio / parada ───────────────────────────────────────────────────────
    def start(self, device_index: Optional[int] = None):
        self.device_index = device_index
        self.is_running   = True
        # Limpiar cola residual
        while not self.speech_queue.empty():
            try:
                self.speech_queue.get_nowait()
            except queue.Empty:
                break
        threading.Thread(target=self._capture_loop, daemon=True).start()

    def stop(self):
        self.is_running = False

    # ── Loop de captura ───────────────────────────────────────────────────────
    def _capture_loop(self):
        p = pyaudio.PyAudio()
        try:
            stream = p.open(
                format=pyaudio.paFloat32,
                channels=1,
                rate=self.SAMPLE_RATE,
                input=True,
                input_device_index=self.device_index,
                frames_per_buffer=self.CHUNK_SIZE,
            )
        except Exception as e:
            print(f"[AudioProcessor] Error abriendo stream: {e}")
            p.terminate()
            return

        cps           = self.SAMPLE_RATE / self.CHUNK_SIZE
        max_sil       = int(self.SILENCE_SEC    * cps)
        min_speech    = int(self.MIN_SPEECH_SEC  * cps)
        max_speech    = int(self.MAX_SPEECH_SEC  * cps)
        accumulated   = []
        silence_count = 0

        while self.is_running:
            try:
                data  = stream.read(self.CHUNK_SIZE, exception_on_overflow=False)
                chunk = np.frombuffer(data, dtype=np.float32)
                rms   = float(np.sqrt(np.mean(chunk ** 2)))

                if rms >= self.VAD_THRESHOLD:
                    silence_count    = 0
                    self.is_speaking = True
                    accumulated.append(chunk)
                    if len(accumulated) >= max_speech:
                        self.speech_queue.put(np.concatenate(accumulated))
                        accumulated = []
                else:
                    silence_count += 1
                    if accumulated:
                        accumulated.append(chunk)
                    if silence_count >= max_sil:
                        self.is_speaking = False
                        if len(accumulated) >= min_speech:
                            self.speech_queue.put(np.concatenate(accumulated))
                        accumulated   = []
                        silence_count = 0
            except Exception:
                break

        if len(accumulated) >= min_speech // 2:
            self.speech_queue.put(np.concatenate(accumulated))

        stream.stop_stream()
        stream.close()
        p.terminate()


# ── WhisperTeleprompter ───────────────────────────────────────────────────────
class WhisperTeleprompter:
    def __init__(self, model_size: str = "small", language: str = "es"):
        self.model_size  = model_size
        self.language    = language
        self.model       = None
        self.ocr_text    = ""
        self.norm_text   = ""
        self.current_pos = 0
        self.audio       = AudioProcessor()

    # ── Whisper ───────────────────────────────────────────────────────────────
    def load_model(self):
        if self.model is not None:
            return
        print(f"[Whisper] Cargando modelo '{self.model_size}' en {DEVICE.upper()}…")
        self.model = whisper.load_model(self.model_size, device=DEVICE)
        print("[Whisper] Modelo listo ✓")

    def transcribe(self, audio: np.ndarray) -> str:
        fp16 = DEVICE == "cuda"
        res  = self.model.transcribe(
            audio,
            language=self.language,
            fp16=fp16,
            verbose=False,
            condition_on_previous_text=False,
        )
        return res["text"].strip().lower()

    # ── Avance de posición ────────────────────────────────────────────────────
    def advance_position(self, transcription: str) -> Tuple[int, float]:
        if not self.norm_text or not transcription:
            return self.current_pos, 0.0

        t           = transcription.lower().strip()
        search_from = max(0, self.current_pos - 30)
        search_to   = min(len(self.norm_text), self.current_pos + 600)
        window      = self.norm_text[search_from:search_to]

        idx = window.find(t)
        if idx != -1:
            return search_from + idx + len(t), 1.0

        matcher = SequenceMatcher(None, window, t, autojunk=False)
        match   = matcher.find_longest_match(0, len(window), 0, len(t))
        if match.size > 6:
            return search_from + match.a + match.size, match.size / len(t)

        return self.current_pos, 0.2

    # ── OCR / extracción de texto ─────────────────────────────────────────────
    def extract_pdf_with_ocr(
        self,
        pdf_path: str,
        progress_cb: Optional[Callable[[int, str], None]] = None,
    ) -> str:
        if progress_cb:
            progress_cb(5, "Convirtiendo PDF a imágenes…")
        images_dir = (
            self._pdf_to_images(pdf_path, progress_cb)
            if pdf_path.lower().endswith(".pdf")
            else None
        )

        if progress_cb:
            progress_cb(40, "Inicializando OCR…")
        ocr = PaddleOCR(
            use_textline_orientation=True,
            lang=self.language,
            enable_mkldnn=False,
        )

        if images_dir:
            if progress_cb:
                progress_cb(50, "Reconociendo texto…")
            text = self._ocr_folder(ocr, images_dir, progress_cb)
            import shutil
            shutil.rmtree(images_dir)
        else:
            text = self._parse_result(ocr.predict(pdf_path))

        self.ocr_text  = text
        self.norm_text = text.lower().strip()

        if progress_cb:
            progress_cb(100, f"Extraídos {len(text)} caracteres ✓")
        return text

    def _pdf_to_images(self, pdf_path: str, progress_cb=None) -> str:
        try:
            import fitz
        except ImportError:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install", "pymupdf"]
            )
            import fitz

        out = f"./tmp_ocr_{int(datetime.now().timestamp())}"
        os.makedirs(out, exist_ok=True)
        doc   = fitz.open(pdf_path)
        total = len(doc)

        for i, page in enumerate(doc):
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            pix.save(os.path.join(out, f"page_{i:04d}.png"))
            if progress_cb:
                pct = 5 + int((i + 1) / total * 30)
                progress_cb(pct, f"Convirtiendo página {i+1}/{total}…")
        doc.close()
        return out

    def _ocr_folder(self, ocr, folder: str, progress_cb=None) -> str:
        parts = []
        imgs  = sorted(Path(folder).glob("page_*.png"))
        total = len(imgs)

        for i, img in enumerate(imgs):
            result = ocr.predict(str(img))
            text   = self._parse_result(result)
            parts.append(text)
            if progress_cb:
                pct = 50 + int((i + 1) / total * 45)
                progress_cb(pct, f"OCR página {i+1}/{total}…")
        return "\n\n".join(parts)

    @staticmethod
    def _parse_result(result) -> str:
        lines = []
        try:
            for page in result:
                if isinstance(page, dict) and "rec_texts" in page:
                    lines.extend(
                        [t for t in page["rec_texts"] if t and t.strip()]
                    )
                elif hasattr(page, "rec_texts"):
                    lines.extend(
                        [t for t in page.rec_texts if t and t.strip()]
                    )
                elif isinstance(page, list):
                    for item in page:
                        if item and len(item) > 1:
                            lines.append(item[1][0])
        except Exception:
            pass
        return "\n".join(lines)

    # ── Persistencia ──────────────────────────────────────────────────────────
    def save_json(self, path: str):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "extracted_at": datetime.now().isoformat(),
                    "language":     self.language,
                    "text":         self.ocr_text,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

    def load_json(self, path: str):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.ocr_text  = data["text"]
        self.norm_text = self.ocr_text.lower().strip()

    def load_text(self, text: str):
        self.ocr_text  = text
        self.norm_text = text.lower().strip()
        self.current_pos = 0

    # ── Análisis de personajes ────────────────────────────────────────────────
    def extract_characters(self) -> dict[str, int]:
        """
        Heurística: líneas en MAYÚSCULAS cortas = nombre de personaje.
        Retorna {nombre_personaje: cantidad_de_lineas_de_dialogo}.
        """
        lines      = [l.strip() for l in self.ocr_text.split("\n") if l.strip()]
        characters: dict[str, int] = {}
        current    = None

        for line in lines[1:]:
            if line.isupper() and len(line) < 40 and not re.match(r"^\d+$", line):
                current = line.replace(":", "").strip()
                characters.setdefault(current, 0)
            elif current:
                characters[current] += 1

        return {k: v for k, v in characters.items() if v > 0}

    # ── Segmentos por personaje ───────────────────────────────────────────────
    def get_segments(self) -> list[dict]:
        """
        Divide el texto en segmentos:
        [{"character": str | None, "text": str, "start": int, "end": int}, ...]
        Los segmentos sin personaje son narración/acotaciones.
        """
        lines    = self.ocr_text.split("\n")
        segments = []
        current_char: Optional[str] = None
        buffer:  list[str]          = []
        pos                         = 0

        def flush():
            nonlocal pos
            joined = "\n".join(buffer).strip()
            if joined:
                segments.append(
                    {
                        "character": current_char,
                        "text":      joined,
                        "start":     pos,
                        "end":       pos + len(joined),
                    }
                )
            pos += sum(len(l) + 1 for l in buffer)

        for line in lines:
            stripped = line.strip()
            if stripped.isupper() and len(stripped) < 40 and not re.match(r"^\d+$", stripped):
                flush()
                buffer       = [line]
                current_char = stripped.replace(":", "").strip()
            else:
                buffer.append(line)
        flush()
        return segments
