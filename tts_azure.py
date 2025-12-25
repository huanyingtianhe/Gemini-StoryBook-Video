import json
from pathlib import Path
import azure.cognitiveservices.speech as speechsdk

CONFIG_PATH = Path("config/azure_tts.json")

if not CONFIG_PATH.exists():
    raise RuntimeError(
        f"Config file {CONFIG_PATH} not found. Create it with keys 'speech_key', 'speech_region', 'voice'."
    )

with CONFIG_PATH.open("r", encoding="utf-8") as f:
    cfg = json.load(f)

SPEECH_KEY = cfg.get("speech_key", "").strip()
SPEECH_REGION = cfg.get("speech_region", "").strip()
VOICE = cfg.get("voice", "").strip() or "zh-CN-XiaomoNeural"

DATA_PATH = Path("data/story.json")
OUTPUT_DIR = Path("audio")

if SPEECH_KEY in (None, "", "YOUR_SPEECH_KEY") or SPEECH_REGION in (None, "", "YOUR_SPEECH_REGION"):
    raise RuntimeError("Set speech_key and speech_region in config/azure_tts.json before running.")

speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
speech_config.speech_synthesis_voice_name = VOICE
speech_config.set_speech_synthesis_output_format(
    speechsdk.SpeechSynthesisOutputFormat.Riff16Khz16BitMonoPcm
)
audio_config = None  # we will write the returned audio_data ourselves
synthesizer = speechsdk.SpeechSynthesizer(speech_config=speech_config, audio_config=audio_config)

with DATA_PATH.open("r", encoding="utf-8") as f:
    story = json.load(f)

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

for page in story.get("pages", []):
    text = page.get("text", "").strip()
    if not text:
        continue
    out_path = OUTPUT_DIR / f"page_{page.get('id', 'unknown')}.wav"
    result = synthesizer.speak_text_async(text).get()
    if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
        with out_path.open("wb") as audio_file:
            audio_file.write(result.audio_data)
        print(f"Audio {out_path}")
    elif result.reason == speechsdk.ResultReason.Canceled:
        cancellation = result.cancellation_details
        raise RuntimeError(f"TTS canceled: {cancellation.reason} {cancellation.error_details}")

print("✔ Azure TTS finished")
