"""Narration with Kokoro (Apache-2.0, runs on the CPU, free for commercial use) + word timings for captions.

One wav per beat, so every beat's length is exact. Captions use the script's own words, timed by faster-whisper
(MIT): the script text is mapped onto whisper's word clock by character position, so spelling always matches.
"""
import json
import os
import re

import numpy as np
import soundfile as sf


def _models():
    for d in (os.environ.get("PAPERCUT_KOKORO"), os.path.join(os.path.expanduser("~"), ".papercut", "kokoro"), r"C:\kokoro\models"):
        if d and os.path.exists(os.path.join(d, "kokoro-v1.0.onnx")):
            return d
    raise SystemExit("Kokoro models not found: run setup (it downloads them to ~/.papercut/kokoro)")


GAP = 0.18  # silence between beats (s)


def synth(beats, out_dir, voice="af_heart", speed=1.0, lang="en-us"):
    from kokoro_onnx import Kokoro
    km = _models()
    k = Kokoro(os.path.join(km, "kokoro-v1.0.onnx"), os.path.join(km, "voices-v1.0.bin"))
    os.makedirs(out_dir, exist_ok=True)
    clips, sr = [], 24000
    for i, b in enumerate(beats):
        x, sr = k.create(b["say"], voice=voice, speed=speed, lang=lang)
        x = np.asarray(x, np.float32)
        # trim Kokoro's own leading/trailing silence so beats sit tight, then add a fixed gap
        nz = np.where(np.abs(x) > 0.004)[0]
        if len(nz):
            x = x[max(0, nz[0] - int(0.02 * sr)): nz[-1] + int(0.06 * sr)]
        clips.append(x)
    t, timing, parts = 0.25, [], [np.zeros(int(0.25 * sr), np.float32)]
    for x in clips:
        d = len(x) / sr
        timing.append({"start": round(t, 3), "dur": round(d, 3)})
        parts += [x, np.zeros(int(GAP * sr), np.float32)]
        t += d + GAP
    parts.append(np.zeros(int(0.6 * sr), np.float32))
    full = np.concatenate(parts)
    path = os.path.join(out_dir, "vo.wav")
    sf.write(path, full, sr, subtype="PCM_16")
    return path, timing, len(full) / sr


def words(vo_path, beats, timing, model="small", language="en"):
    """Script tokens with start/end times, grouped per beat."""
    from faster_whisper import WhisperModel
    m = WhisperModel(model, device="cpu", compute_type="int8")
    from scipy.signal import resample_poly
    x, sr = sf.read(vo_path, dtype="float32")
    x = resample_poly(x, 16000, sr).astype(np.float32)  # hand whisper an array: avoids PyAV version clashes
    segs, _ = m.transcribe(x, word_timestamps=True, language=language)
    ww = [w for s in segs for w in (s.words or [])]
    out = []
    for b, tm in zip(beats, timing):
        a, z = tm["start"], tm["start"] + tm["dur"]
        inside = [w for w in ww if w.start >= a - 0.15 and w.end <= z + 0.25]
        toks = b["say"].split()
        total = max(1, sum(len(re.sub(r"\W", "", t)) or 1 for t in toks))
        # whisper clock: cumulative chars -> time (even spacing if whisper heard nothing here)
        xs, ts = [0], [inside[0].start if inside else a]
        c = 0
        for w in inside:
            c += len(re.sub(r"\W", "", w.word)) or 1
            xs.append(c)
            ts.append(w.end)
        if not inside:
            xs, ts = [0, total], [a, z]
        scale = xs[-1] / total if xs[-1] else 1
        cur, row = 0, []
        for t in toks:
            n = len(re.sub(r"\W", "", t)) or 1
            s = float(np.interp(cur * scale, xs, ts))
            e = float(np.interp((cur + n) * scale, xs, ts))
            row.append({"w": t, "s": round(s, 3), "e": round(max(e, s + 0.08), 3)})
            cur += n
        out.append(row)
    return out


def from_file(src, beats, out_dir, model="small", language="ru"):
    """paper-history: one ready voice file (ElevenLabs, own recording) instead of Kokoro.
    Whisper hears the whole file, the script is laid onto its word clock by characters,
    and every beat gets its start/length from its own words."""
    import subprocess
    from faster_whisper import WhisperModel
    from scipy.signal import resample_poly
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "vo.wav")
    LEAD = 0.3  # the engine starts every beat slightly before its first word, so the film needs a short lead-in
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-ac", "1", "-ar", "48000",
                    "-af", f"adelay={int(LEAD * 1000)}:all=1", path], check=True)
    x, sr = sf.read(path, dtype="float32")
    total = len(x) / sr + 0.6
    m = WhisperModel(model, device="cpu", compute_type="int8")
    segs, _ = m.transcribe(resample_poly(x, 1, 3).astype(np.float32), word_timestamps=True, language=language)
    ww = [w for s in segs for w in (s.words or [])]
    clean = lambda t: len(re.sub(r"\W", "", t)) or 1
    xs, ts, c = [0], [ww[0].start if ww else 0.0], 0
    for w in ww:
        c += clean(w.word); xs.append(c); ts.append(w.end)
    toks = [(i, t) for i, b in enumerate(beats) for t in b["say"].split()]
    total_chars = sum(clean(t) for _, t in toks)
    scale = xs[-1] / total_chars if total_chars else 1
    rows, cur = [[] for _ in beats], 0
    for i, t in toks:
        n = clean(t)
        s = float(np.interp(cur * scale, xs, ts)); e = float(np.interp((cur + n) * scale, xs, ts))
        rows[i].append({"w": t, "s": round(s, 3), "e": round(max(e, s + 0.08), 3)})
        cur += n
    timing = []
    for i, r in enumerate(rows):
        a = LEAD - 0.05 if i == 0 else max(LEAD, r[0]["s"] - 0.08)
        z = rows[i + 1][0]["s"] - 0.08 if i + 1 < len(rows) else total - 0.6
        timing.append({"start": round(a, 3), "dur": round(max(0.3, z - a), 3)})
    return timing, rows, total


if __name__ == "__main__":
    import sys
    story = json.load(open(sys.argv[1], encoding="utf-8"))
    p, tm, total = synth(story["beats"], "assets/audio", story.get("voice", "af_heart"))
    print(p, round(total, 2), tm)
