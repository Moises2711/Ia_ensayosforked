# Whisper Teleprompter – Backend v2

## Estructura del proyecto

```
teleprompter/
├── api.py                        ← FastAPI (punto de entrada)
├── requirements.txt
├── recordings/                   ← Audios WAV guardados (auto-creado)
└── core/
    ├── teleprompter_engine.py    ← Whisper + AudioProcessor + segmentación
    └── recording_manager.py     ← Grabación, reproducción y orquestación
```

---

## Iniciar el servidor

```bash
pip install -r requirements.txt
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

Documentación interactiva: `http://localhost:8000/docs`

---

## Variables de entorno

| Variable         | Default           | Descripción                         |
|------------------|-------------------|-------------------------------------|
| `DB_PATH`        | `teleprompter.db` | Ruta a la base SQLite               |
| `RECORDINGS_DIR` | `recordings/`     | Carpeta donde se guardan los WAVs   |
| `WHISPER_MODEL`  | `small`           | Tamaño del modelo (tiny/small/medium/large) |
| `WHISPER_LANG`   | `es`              | Idioma del guion                    |

---

## Flujos principales

### Flujo A – Grabar las líneas del "otro personaje"

```
Frontend (Lovable)                    Backend (FastAPI)
────────────────────                  ─────────────────────────────────

1. POST /script/load/file             → Extrae texto y personajes del guion
   ← { characters: {ROMEO:12, JULIETA:10} }

2. POST /session                      → Crea sesión
   body: { script_id, my_character:"JULIETA",
           other_character:"ROMEO" }
   ← { session_id: "abc-123" }

3. WS  /ws/record/abc-123             → Conectar WebSocket

4. Servidor envía →  { event:"segment", index:3,
                       text:"¿Eres Romeo, o es sólo el nombre?",
                       progress:"1/12" }

5. Usuario pulsa REC en la UI
   Cliente envía → { action:"record_start" }

6. El usuario habla. El cliente captura audio con MediaRecorder
   y va enviando chunks:
   Cliente envía → { action:"audio_chunk", data:"<base64 PCM float32>" }
   (en loop mientras graba)

7. Usuario suelta REC
   Cliente envía → { action:"record_stop" }
   Servidor guarda WAV en disco y en SQLite →
   ← { event:"saved", recording_id:"xyz", duration_sec:3.2 }

8. Servidor avanza automáticamente →
   ← { event:"segment", index:7, text:"...", progress:"2/12" }

9. Repetir pasos 5-8 para cada segmento.

10. Al terminar →
    ← { event:"done", message:"¡Todas las líneas grabadas! 🎉" }
```

---

### Flujo B – Ensayo con reproducción automática

```
Frontend (Lovable)                    Backend (FastAPI)
────────────────────                  ─────────────────────────────────

1. (El guion ya está cargado, la sesión ya existe con grabaciones de ROMEO)

2. WS  /ws/rehearsal/abc-123          → Conectar WebSocket

3. Cliente envía → { action:"start", mic_index:0 }
   Servidor carga Whisper y empieza a escuchar el micrófono →
   ← { event:"status", message:"Ensayo iniciado 🎤" }

4. JULIETA (usuario) habla en voz alta.
   Whisper transcribe →
   ← { event:"transcription", text:"pero qué luz", confidence:0.9, position:234 }

5. El teleprompter avanza. Cuando llega a un segmento de ROMEO:
   ← { event:"segment_change", segment:{character:"ROMEO", text:"..."}, is_my_turn:false }
   ← { event:"playback_start", character:"ROMEO" }
   → El servidor reproduce el audio de ROMEO en los altavoces del servidor
     (o el frontend recibe playback_start y reproduce el audio desde /recordings/<file>)
   ← { event:"playback_finish", character:"ROMEO" }

6. Si una línea de ROMEO no tiene audio grabado:
   ← { event:"missing_audio", segment:{character:"ROMEO", text:"..."} }
   → La UI puede mostrar el texto en pantalla como fallback.

7. Para detener: { action:"stop" }
   Para reiniciar: { action:"reset" }
```

---

## Nota sobre reproducción en el frontend vs. servidor

El `PlaybackEngine` reproduce audio **en el servidor** (útil para desarrollo
local o apps de escritorio). En producción con Lovable (navegador), cuando
recibas `playback_start` con el `character` y el `event:"segment_change"`,
el frontend puede:

```js
// En el WebSocket message handler:
if (msg.event === "playback_start") {
  const url = `/recordings/${sessionId}_seg${segmentIndex}_*.wav`
  // Mejor: obtén la URL del evento missing_audio o de GET /recording/{session}/{char}
  const audio = new Audio(audioUrl)
  audio.play()
}
```

Para que el frontend controle la reproducción, llama primero a:
```
GET /recording/{session_id}/{character}
→ lista de { segment_index, audio_url, ... }
```
y cachea las URLs en el cliente.

---

## Tablas SQLite añadidas

```sql
-- Sesiones de ensayo
CREATE TABLE rehearsal_sessions (
    id              TEXT PRIMARY KEY,
    script_id       INTEGER NOT NULL,
    my_character    TEXT    NOT NULL,
    other_character TEXT    NOT NULL,
    created_at      TEXT    NOT NULL
);

-- Grabaciones por segmento
CREATE TABLE character_recordings (
    id              TEXT PRIMARY KEY,
    session_id      TEXT    NOT NULL,
    script_id       INTEGER NOT NULL,
    character       TEXT    NOT NULL,
    segment_index   INTEGER NOT NULL,
    segment_text    TEXT    NOT NULL,
    audio_path      TEXT    NOT NULL,
    duration_sec    REAL    NOT NULL,
    created_at      TEXT    NOT NULL,
    FOREIGN KEY (session_id) REFERENCES rehearsal_sessions(id)
);
```

Las tablas se crean automáticamente si no existen; no se toca ninguna
tabla pre-existente en tu base de datos.
