"""Время каждого слова в голосе (бесплатно, на компьютере, Whisper).
   python scripts/words.py media/voice.mp3 [ru|en|kk] > media/words.json
   Формат: [["слово", секунда], ...]
"""
import json, subprocess, sys
import numpy as np
from faster_whisper import WhisperModel

src = sys.argv[1]
lang = sys.argv[2] if len(sys.argv) > 2 else None
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                     capture_output=True, check=True).stdout
audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
model = WhisperModel(sys.argv[3] if len(sys.argv) > 3 else "small", device="cpu", compute_type="int8")
segs, info = model.transcribe(audio, language=lang, word_timestamps=True, vad_filter=False)
out = []
for s in segs:
    for w in s.words:
        word = w.word.strip()
        if word:
            out.append([word, round(w.start, 2)])
sys.stdout.reconfigure(encoding="utf-8")
print(json.dumps(out, ensure_ascii=False))
print(f"слов: {len(out)}, длина: {len(audio)/16000:.1f} с, язык: {info.language}", file=sys.stderr)
