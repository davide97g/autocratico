"""Run mlx-whisper (word timestamps) on the time-corrected vocal stem.

Writes work/whisper_<tag>.json. Used as an independent cross-check for the
CTC forced alignment in align.py.
"""
import common  # noqa: F401  (sets cache dirs)
import json, sys
import mlx_whisper

MODELS = {
    "turbo": "mlx-community/whisper-large-v3-turbo",
    "large": "mlx-community/whisper-large-v3-mlx",
}

def run(tag, model, prompt=None):
    res = mlx_whisper.transcribe(
        str(common.WORK / "vocals16k.wav"), path_or_hf_repo=model, language="it",
        word_timestamps=True, condition_on_previous_text=False, initial_prompt=prompt,
        temperature=0.0, no_speech_threshold=None, hallucination_silence_threshold=None,
    )
    out = common.WORK / f"whisper_{tag}.json"
    out.write_text(json.dumps(res, indent=1, default=float))
    for seg in res["segments"]:
        print(f"{seg['start']:7.2f} {seg['end']:7.2f} {seg['text']}")
    return res

if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "turbo"
    prompt = ("Testo di una canzone rap italiana sulla burocrazia: raccomandata, PEC, F24, scadenza, "
              "gerontocrazia, IMU, TARI, bollo, cartella, numerino, follia, autocratico, phishing, Telegram.")
    run(which, MODELS[which])
    run(which + "_prompt", MODELS[which], prompt)
