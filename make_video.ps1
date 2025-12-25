$ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
if (-not $ffmpegCommand) {
  throw "ffmpeg executable not found. Install ffmpeg and ensure it is on the PATH, then rerun make_video.ps1."
}
$ffmpeg = $ffmpegCommand.Source

$ffprobeCommand = Get-Command ffprobe -ErrorAction SilentlyContinue
if (-not $ffprobeCommand) {
  throw "ffprobe executable not found. Install ffmpeg (with ffprobe) and ensure it is on the PATH."
}
$ffprobe = $ffprobeCommand.Source

$story = Get-Content data\story.json | ConvertFrom-Json
New-Item video -ItemType Directory -Force | Out-Null
New-Item output -ItemType Directory -Force | Out-Null

$list = @()
$durations = @()

function Get-DurationSeconds($file) {
  $raw = & $ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $file
  return [double]::Parse($raw, [System.Globalization.CultureInfo]::InvariantCulture)
}

foreach ($p in $story.pages) {
    $mp4 = "video\page_$($p.id).mp4"
    & $ffmpeg -y `
      -loop 1 -i "images\page_$($p.id).png" `
      -i "audio\page_$($p.id).wav" `
      -c:v libx264 `
      -tune stillimage `
      -pix_fmt yuv420p `
      -shortest `
      $mp4

    if ($LASTEXITCODE -ne 0) {
        throw "ffmpeg render failed for page $($p.id) with exit code $LASTEXITCODE."
    }

  $list += "file 'page_$($p.id).mp4'"
  $durations += Get-DurationSeconds $mp4
}

$list | Set-Content video\list.txt -Encoding ascii

if ($durations.Count -eq 1) {
  $single = "video/page_$($story.pages[0].id).mp4"
  & $ffmpeg -y -i $single -c copy output/story.mp4
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed for single page with exit code $LASTEXITCODE."
  }
  Write-Host "✔ output\story.mp4 generated (single page)"
  exit 0
}

# Simple concat (no transitions)
Push-Location .
& $ffmpeg -y -f concat -safe 0 -i video/list.txt -c copy output/story.mp4
$concatExit = $LASTEXITCODE
Pop-Location

if ($concatExit -ne 0) {
  throw "ffmpeg concat failed with exit code $concatExit. See console output above."
}

Write-Host "\u2714 output\story.mp4 generated (no transitions)"
