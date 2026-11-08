# Launch START_PUBLISH.cmd. Login happens only in your own browser.
$ErrorActionPreference = 'Stop'
$owner = 'Artem1hs'
$project = 'chestnaya-masterskaya'
$full = "$owner/$project"
$url = "https://$owner.github.io/$project/"
$site = Join-Path $PSScriptRoot 'site'

function Require-Command($name, $downloadUrl) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
        Write-Host "Required tool is missing: $name" -ForegroundColor Yellow
        Write-Host "Install from: $downloadUrl"
        Start-Process $downloadUrl
        throw "Install $name, then run START_PUBLISH.cmd again."
    }
}

try {
    if (-not (Test-Path (Join-Path $site 'index.html'))) { throw 'site/index.html missing from archive.' }
    Require-Command 'git' 'https://git-scm.com/downloads/win'
    Require-Command 'gh' 'https://cli.github.com/'

    # GitHub CLI authenticates using the browser. Never enter a token into this script.
    & gh auth status *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'GitHub login required. Complete the login in the browser.'
        & gh auth login --web --git-protocol https --scopes repo
        if ($LASTEXITCODE -ne 0) { throw 'GitHub login failed.' }
    }
    $login = (& gh api user --jq .login)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read GitHub account.' }
    $login = ($login | Out-String).Trim()
    if ($login -ine $owner) { throw "Signed in as $login; expected $owner. Change GitHub CLI account, then retry." }

    & gh auth setup-git
    if ($LASTEXITCODE -ne 0) { throw 'Could not configure Git authentication.' }

    # Avoid accidentally replacing files in a pre-existing repository.
    & gh repo view $full --json name --jq .name *> $null
    if ($LASTEXITCODE -eq 0) {
        throw "Repository $full already exists. This script never overwrites an existing repository."
    }

    Push-Location $site
    try {
        & git init -b main
        if ($LASTEXITCODE -ne 0) { throw 'git init failed.' }
        & git add -A
        if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
        & git -c "user.name=$owner" -c 'user.email=86528362+Artem1hs@users.noreply.github.com' commit -m 'Publish Chestnaya Masterskaya static site'
        if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
        Write-Host 'Creating the public repository and uploading site assets...'
        & gh repo create $full --public --source=. --remote=origin --push
        if ($LASTEXITCODE -ne 0) { throw 'Repository creation or git push failed. Check the error shown above.' }
    }
    finally { Pop-Location }

    Write-Host 'Enabling GitHub Pages...'
    & gh api --method POST "repos/$full/pages" -f 'source[branch]=main' -f 'source[path]=/' *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Files are uploaded, but automatic Pages activation failed.' -ForegroundColor Yellow
        Write-Host "Open: https://github.com/$full/settings/pages"
        Write-Host 'Source: Deploy from a branch | Branch: main | Folder: /(root) | Save'
    } else {
        Write-Host 'Pages activation requested.' -ForegroundColor Green
    }
    Write-Host "Repository: https://github.com/$full"
    Write-Host "Website (after publishing completes): $url"
    Start-Process "https://github.com/$full/settings/pages"
}
catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
