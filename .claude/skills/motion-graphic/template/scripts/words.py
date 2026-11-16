# Время каждого слова из озвучки (для синхрона анимации с голосом)
# python -I scripts/words.py media/voice.mp3 media/words.json
# Нужно: pip install faster-whisper numpy, и ffmpeg в PATH.
import sys, json, subprocess, numpy as np
from faster_whisper import WhisperModel

src, out = sys.argv[1], sys.argv[2]
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'],
                     capture_output=True, check=True).stdout
audio = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
model = WhisperModel('small', device='cpu', compute_type='int8')
segs, info = model.transcribe(audio, word_timestamps=True)
words = [[w.word.strip(), round(w.start, 2), round(w.end, 2)] for s in segs for w in s.words]
with open(out, 'w', encoding='utf-8') as f:
    json.dump(words, f, ensure_ascii=False, indent=0)
print(f'{len(words)} слов, язык {info.language}, длина {len(audio) / 16000:.1f} с -> {out}')
