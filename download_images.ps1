$story = Get-Content data\story.json | ConvertFrom-Json
New-Item images -ItemType Directory -Force | Out-Null

foreach ($p in $story.pages) {
    $out = "images\page_$($p.id).png"
    Invoke-WebRequest $p.imageUrl -OutFile $out
    Write-Host "Downloaded $out"
}
