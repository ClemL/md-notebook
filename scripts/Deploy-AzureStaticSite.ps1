<#
.SYNOPSIS
    Builds md-notebook and publishes it to an Azure Storage static website.

.DESCRIPTION
    The app is a static site with no server component, so the $web container of a Storage
    Account hosts it as-is, over HTTPS, with nothing to patch or keep running.

.EXAMPLE
    .\Deploy-AzureStaticSite.ps1
    Builds and deploys to the default account below.

.EXAMPLE
    .\Deploy-AzureStaticSite.ps1 -StorageAccount 'inscriptrxtools' -SkipBuild
    Deploys the existing out/ folder without rebuilding.
#>
[CmdletBinding()]
param(
    [string] $StorageAccount = 'inscriptrxtools',
    [string] $ResourceGroup  = 'rg-internal-tools',
    [string] $Subscription   = '',
    [string] $Source         = (Join-Path $PSScriptRoot '..\out'),
    [string] $IndexDocument  = 'index.html',
    [string] $ErrorDocument  = '404.html',
    [switch] $SkipBuild
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw 'The Azure CLI (az) is not installed. See https://aka.ms/installazurecli'
}

if (-not $SkipBuild) {
    Write-Host 'Building the static site...' -ForegroundColor Cyan
    Push-Location (Join-Path $PSScriptRoot '..')
    try {
        npm ci
        npm run build:static
        if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE." }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $Source)) { throw "No build output at $Source. Run npm run build:static first." }

if ($Subscription) { az account set --subscription $Subscription }

Write-Host 'Enabling static website hosting...' -ForegroundColor Cyan
az storage blob service-properties update `
    --account-name $StorageAccount `
    --static-website true `
    --index-document $IndexDocument `
    --404-document $ErrorDocument `
    --auth-mode login | Out-Null

Write-Host "Uploading $Source to `$web..." -ForegroundColor Cyan
az storage blob upload-batch `
    --account-name $StorageAccount `
    --destination '$web' `
    --source $Source `
    --overwrite `
    --auth-mode login | Out-Null

$endpoint = az storage account show `
    --name $StorageAccount `
    --resource-group $ResourceGroup `
    --query 'primaryEndpoints.web' `
    --output tsv

Write-Host ''
Write-Host "Deployed: $endpoint" -ForegroundColor Green
Write-Host 'Clipboard features need HTTPS, which this endpoint already serves.'
