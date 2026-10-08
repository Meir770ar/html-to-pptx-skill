param(
  [Parameter(Mandatory=$true)][string]$Pptx,
  [Parameter(Mandatory=$true)][string]$OutputDir,
  [int]$Width = 1920,
  [int]$Height = 1080
)
$ErrorActionPreference = 'Stop'
$sourcePath = (Resolve-Path -LiteralPath $Pptx).Path
$targetPath = [System.IO.Path]::GetFullPath($OutputDir)
if (Test-Path -LiteralPath $targetPath) { throw 'Choose a new verification output directory.' }
New-Item -ItemType Directory -Path $targetPath | Out-Null
$wasRunning = @(Get-Process POWERPNT -ErrorAction SilentlyContinue).Count -gt 0
$application = New-Object -ComObject PowerPoint.Application
$deck = $null
try {
  $deck = $application.Presentations.Open($sourcePath, -1, 0, 0)
  $slides = @()
  foreach ($slide in $deck.Slides) {
    $textCount = 0; $pictureCount = 0; $tableCount = 0; $text = @()
    foreach ($shape in $slide.Shapes) {
      if ($shape.HasTable -eq -1) { $tableCount++ }
      if ($shape.Type -eq 13) { $pictureCount++ }
      if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
        $textCount++; $text += $shape.TextFrame.TextRange.Text
      }
    }
    $png = Join-Path $targetPath ('slide-{0:D2}.png' -f $slide.SlideIndex)
    $slide.Export($png, 'PNG', $Width, $Height)
    $slides += @{ index=$slide.SlideIndex; shapes=$slide.Shapes.Count; textBoxes=$textCount; pictures=$pictureCount; tables=$tableCount; text=$text; png=$png }
  }
  $receipt = @{ application='Microsoft PowerPoint'; source=$sourcePath; slideCount=$deck.Slides.Count; width=$Width; height=$Height; slides=$slides }
  $receipt | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath (Join-Path $targetPath 'powerpoint-verification.json') -Encoding utf8
  Write-Output ('Verified {0} slides in Microsoft PowerPoint.' -f $deck.Slides.Count)
} finally {
  if ($null -ne $deck) { $deck.Close(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($deck) }
  if (-not $wasRunning) { $application.Quit() }
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($application)
}
