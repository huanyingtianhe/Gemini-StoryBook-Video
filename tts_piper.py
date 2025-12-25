import json
import wave
from pathlib import Path

from piper import PiperVoice, SynthesisConfig

# ---- Piper config: paths to model and config downloaded via `python -m piper.download_voices` ----
MODEL = Path("tools/piper/zh_CN-huayan-medium.onnx")
CONFIG = MODEL.with_suffix(".onnx.json")

# ---- Tuning knobs (feel free to adjust) ----
# length_scale >1 makes speech slower; <1 faster
LENGTH_SCALE = 1.05
# noise controls randomness/expressiveness; lower = more stable
NOISE_SCALE = 0.5
# noise_w controls phoneme length jitter; lower = more stable
NOISE_W_SCALE = 0.7
# volume multiplier; 1.0 is default
VOLUME = 1.2

DATA_PATH = Path("data/story.json")
OUTPUT_DIR = Path("audio")
def _ensure_assets():
    missing = [p for p in (MODEL, CONFIG) if not p.exists()]
    if missing:
        missing_str = "\n".join(f"- {p}" for p in missing)
        raise FileNotFoundError(
            "Missing Piper voice files:\n"
            f"{missing_str}\n"
            "Run: python -m piper.download_voices zh_CN-huayan-medium --download-dir tools/piper"
        )


def synthesize(text: str, out_path: Path, voice: PiperVoice, syn_config: SynthesisConfig):
    # PiperVoice handles wave headers; we just open a file and let it write.
    with wave.open(str(out_path), "wb") as wav_file:
        voice.synthesize_wav(text, wav_file, syn_config=syn_config)


def main():
    _ensure_assets()
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Story file not found: {DATA_PATH}")

    with DATA_PATH.open("r", encoding="utf-8") as f:
        story = json.load(f)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    pages = story.get("pages", [])
    if not pages:
        print("No pages found in story.json")
        return

    voice = PiperVoice.load(str(MODEL), config_path=str(CONFIG))
    syn_config = SynthesisConfig(
        length_scale=LENGTH_SCALE,
        noise_scale=NOISE_SCALE,
        noise_w_scale=NOISE_W_SCALE,
        volume=VOLUME,
    )

    for page in pages:
        text = page.get("text", "").strip()
        if not text:
            continue
        page_id = page.get("id", "unknown")
        out_path = OUTPUT_DIR / f"page_{page_id}.wav"
        synthesize(text, out_path, voice, syn_config)
        print(f"Audio {out_path}")

    print("✔ Piper TTS finished")


if __name__ == "__main__":
    main()
