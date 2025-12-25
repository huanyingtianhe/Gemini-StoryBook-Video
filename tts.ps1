Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

# Prefer these voices if available; fall back to the first enabled voice to avoid hard failures.
$preferredVoices = @(
    "Microsoft Xiaoxiao Desktop"  # zh-CN female
)
$installedVoices = $synth.GetInstalledVoices() | Where-Object { $_.Enabled } | Select-Object -ExpandProperty VoiceInfo

$selectedVoice = $null
foreach ($voiceInfo in $installedVoices) {
    if ($preferredVoices -contains $voiceInfo.Name) {
        $selectedVoice = $voiceInfo.Name
        break
    }
}

if (-not $selectedVoice -and $installedVoices) {
    $selectedVoice = $installedVoices[0].Name
    Write-Host "Preferred voices not found; using '$selectedVoice'" -ForegroundColor Yellow
}

if (-not $selectedVoice) {
    throw "No enabled speech synthesis voices are installed. Install a TTS voice in Windows Settings."
}

$synth.SelectVoice($selectedVoice)
$synth.Volume = 100
$synth.Rate = 0
Write-Host "Using voice: $selectedVoice" -ForegroundColor Cyan

$story = Get-Content data\story.json | ConvertFrom-Json
New-Item audio -ItemType Directory -Force | Out-Null

foreach ($p in $story.pages) {
    $out = "audio\page_$($p.id).wav"
    $synth.SetOutputToWaveFile($out)
    $synth.Speak($p.text)
    $synth.SetOutputToNull()
    $synth.SetOutputToDefaultAudioDevice()
    Write-Host "text: $($p.text)" -ForegroundColor Green
    Write-Host "Audio $out"
}
