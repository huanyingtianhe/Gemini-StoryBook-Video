param(
	[Parameter(Mandatory = $false)]
	[string] $StoryUrl
)

if (-not $StoryUrl -or $StoryUrl.Trim() -eq "") {
	$StoryUrl = Read-Host "Enter Gemini share URL"
}

node grab_story.js --url "$StoryUrl"
.\download_images.ps1
python tts_azure.py
.\make_video.ps1