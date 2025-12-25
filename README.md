# Gemini Storybook Video

Create a narrated video from a Gemini story share: scrape text/image pages, download assets, synthesize audio, and render a stitched MP4.

## What it does
- `grab_story.js` uses Playwright to scrape pages (text) and screenshot the visible spread into `images/page_*.png`, writing `data/story.json`.
- TTS options:
  - `tts_azure.py` (Azure Cognitive Services; config in `config/azure_tts.json`).
  - `tts_piper.py` (offline Piper voice model).
  - `tts.ps1` (Windows built-in voices) as a simple fallback.
- `make_video.ps1` combines each page image + audio into per-page MP4s and concats them into `output/story.mp4` (no transitions).
- `run.ps1` runs the typical end-to-end flow: scrape → images → Azure TTS → video.

## Prerequisites
- Windows with PowerShell.
- Node.js (Playwright dependency) and `npm install` in the repo.
- Python 3 (for Azure/Piper TTS paths).
- ffmpeg/ffprobe on PATH.
- Network access to the Gemini share URL.

## Setup
1) Install Node deps:
```pwsh
npm install
```
2) Install Playwright browsers (once):
```pwsh
npx playwright install chromium
```
3) Azure TTS (if using): create `config/azure_tts.json` with your key/region/voice:
```json
{
  "speech_key": "YOUR_SPEECH_KEY",
  "speech_region": "YOUR_SPEECH_REGION",
  "voice": "zh-CN-XiaomoNeural"
}
```
4) Piper TTS (optional offline):
```pwsh
python -m pip install piper-phonemizer piper-tts
python -m piper.download_voices zh_CN-huayan-medium --download-dir tools/piper
```
Ensure the downloaded files match the paths in `tts_piper.py`.

## Usage
-- Full pipeline (Azure TTS path):
```pwsh
pwsh .\run.ps1                # prompts for Gemini share URL
# or
pwsh .\run.ps1 -StoryUrl "https://gemini.google.com/share/..."  # preferred; no env vars
```
- Individual steps:
  - Scrape story: `node grab_story.js --url "https://gemini.google.com/share/..."` (preferred). Outputs `data/story.json` and screenshots to `images/`.
  - Azure TTS: `python tts_azure.py`.
  - Piper TTS: `python tts_piper.py`.
  - Windows TTS: `pwsh .\tts.ps1`.
  - Render video: `pwsh .\make_video.ps1` (reads `images/` and `audio/`).

## Notes
- `grab_story.js` tunables (env vars): `NAV_TIMEOUT_MS`, `POST_LOAD_WAIT_MS`, `CONTENT_TIMEOUT_MS`, `MAX_PAGES`, `MIN_TEXT_LENGTH`, `DEBUG_SCRAPER=1`.
- Outputs: images go to `images/` (captured via Playwright screenshot), audio to `audio/`, per-page videos to `video/`, final render to `output/story.mp4`.
- ffmpeg concat is stream-copy; if you need re-encoding, add `-c:v libx264 -c:a aac` in `make_video.ps1`.
