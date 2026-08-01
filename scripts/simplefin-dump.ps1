<#
.SYNOPSIS
  Puxa todas as transações do SimpleFin Bridge e salva em CSV.

.DESCRIPTION
  Standalone PowerShell — não faz parte do app (não roda no Vercel, não usa
  Redis). Espelha a lógica de fetch/mapeamento de lib/simplefin.js para que
  o CSV gerado tenha o mesmo shape usado no import manual da UI (Settings →
  Import CSV): date, description, amount, category, account, srcAccount,
  accountUrn, sourceId, source.

  Suporta dois modos de credencial:
    1. -AccessUrl (ou env var SIMPLEFIN_ACCESS_URL): URL já reivindicada,
       formato https://usuario:senha@bridge.simplefin.org/simplefin/accounts
    2. -SetupToken: token de setup (string base64 que o SimpleFin mostra uma
       única vez); o script reivindica (claim) e imprime a Access URL
       resultante para você salvar (ela não pode ser reivindicada de novo).

.PARAMETER AccessUrl
  Access URL já reivindicada do SimpleFin Bridge. Se omitida, usa a env var
  SIMPLEFIN_ACCESS_URL.

.PARAMETER SetupToken
  Token de setup (one-time claim). Alternativa a -AccessUrl na primeira
  execução.

.PARAMETER Days
  Quantos dias de histórico buscar (start-date). Default 30, igual ao
  LOOKBACK_DAYS do app.

.PARAMETER OutFile
  Caminho do CSV de saída. Default .\simplefin-transactions-<data>.csv

.EXAMPLE
  $env:SIMPLEFIN_ACCESS_URL = "https://user:pass@bridge.simplefin.org/simplefin/accounts"
  .\simplefin-dump.ps1

.EXAMPLE
  .\simplefin-dump.ps1 -SetupToken "aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0vRVhBTVBMRQ==" -Days 90 -OutFile C:\dump\sf.csv
#>

[CmdletBinding()]
param(
    [string]$AccessUrl = $env:SIMPLEFIN_ACCESS_URL,
    [string]$SetupToken,
    [int]$Days = 30,
    [string]$OutFile
)

$ErrorActionPreference = 'Stop'

function Resolve-AccessUrl {
    param([string]$AccessUrl, [string]$SetupToken)

    if ($SetupToken) {
        # O setup token é a claim URL codificada em base64. Um POST vazio
        # para ela devolve a Access URL em texto puro — só pode ser feito
        # uma vez por token.
        try {
            $claimUrl = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($SetupToken))
        } catch {
            throw "SetupToken não é base64 válido: $($_.Exception.Message)"
        }
        Write-Host "Reivindicando setup token em $claimUrl ..."
        $resolved = Invoke-RestMethod -Method Post -Uri $claimUrl -ContentLength 0
        if (-not $resolved) {
            throw "Claim não retornou uma Access URL. O token já foi usado?"
        }
        Write-Host "Access URL obtida. Guarde-a (não é possível reivindicar o token de novo):"
        Write-Host $resolved
        return $resolved.Trim()
    }

    if (-not $AccessUrl) {
        throw "Nenhuma credencial informada. Passe -AccessUrl, -SetupToken, ou defina `$env:SIMPLEFIN_ACCESS_URL."
    }
    return $AccessUrl.Trim()
}

function ConvertTo-BasicAuthHeader {
    param([System.Uri]$Uri)

    if (-not $Uri.UserInfo) {
        throw "A Access URL não contém credenciais (formato esperado: https://user:pass@host/path)."
    }
    $parts = $Uri.UserInfo.Split(':', 2)
    $user = [System.Uri]::UnescapeDataString($parts[0])
    $pass = if ($parts.Count -gt 1) { [System.Uri]::UnescapeDataString($parts[1]) } else { '' }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("$($user):$($pass)")
    return 'Basic ' + [Convert]::ToBase64String($bytes)
}

function Get-CleanUri {
    param([System.Uri]$Uri, [int]$StartDateSeconds)

    $builder = New-Object System.UriBuilder($Uri)
    $builder.UserName = ''
    $builder.Password = ''
    $path = $builder.Path.TrimEnd('/')
    if ($path -notmatch '/accounts$') {
        $path = "$path/accounts"
    }
    $builder.Path = $path
    $builder.Query = "start-date=$StartDateSeconds"
    return $builder.Uri
}

# --- Resolve credencial e monta a requisição ---------------------------------

$rawAccessUrl = Resolve-AccessUrl -AccessUrl $AccessUrl -SetupToken $SetupToken
$parsedUri = [System.Uri]$rawAccessUrl
$authHeader = ConvertTo-BasicAuthHeader -Uri $parsedUri

$startDateUtc = (Get-Date).ToUniversalTime().AddDays(-$Days)
$startDateSeconds = [DateTimeOffset]::new($startDateUtc, [TimeSpan]::Zero).ToUnixTimeSeconds()
$requestUri = Get-CleanUri -Uri $parsedUri -StartDateSeconds $startDateSeconds

Write-Host "Buscando transações dos últimos $Days dias em $($requestUri.Host)$($requestUri.AbsolutePath) ..."

try {
    $response = Invoke-RestMethod -Method Get -Uri $requestUri -Headers @{ Authorization = $authHeader }
} catch {
    throw "Falha ao chamar o SimpleFin Bridge: $($_.Exception.Message)"
}

if (-not $response.accounts) {
    Write-Warning "Resposta não trouxe nenhuma conta."
    $response.accounts = @()
}

# --- Mapeamento (mesmo shape de lib/simplefin.js:mapTransaction) -------------

$rows = New-Object System.Collections.Generic.List[object]

foreach ($account in $response.accounts) {
    $accountName = $account.name
    $accountUrn = $account.id
    $orgName = $account.org.name

    $txns = @($account.transactions)
    foreach ($t in $txns) {
        if ($null -eq $t -or $null -eq $t.id) { continue }

        $epochSeconds = if ($t.transacted_at) { $t.transacted_at } else { $t.posted }
        $date = if ($epochSeconds) {
            [DateTimeOffset]::FromUnixTimeSeconds([int64]$epochSeconds).UtcDateTime.ToString('yyyy-MM-dd')
        } else {
            (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd')
        }

        $memo = ("" + $t.memo).Trim()
        $rawDescription = if ($t.description) { ("" + $t.description).Trim() } elseif ($t.payee) { ("" + $t.payee).Trim() } else { '' }
        $description = if ($memo) { $memo } elseif ($rawDescription) { $rawDescription } else { '(no description)' }

        $amount = 0
        [void][double]::TryParse([string]$t.amount, [System.Globalization.NumberStyles]::Float, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$amount)

        $rows.Add([PSCustomObject]@{
            id             = "sf_$($t.id)"
            date           = $date
            description    = $description
            amount         = $amount
            category       = 'Other'
            account        = ''
            srcAccount     = $accountName
            accountUrn     = $accountUrn
            orgName        = $orgName
            sourceId       = "$($t.id)"
            source         = 'sf'
            pending        = [bool]$t.pending
        })
    }
}

Write-Host "$($rows.Count) transações mapeadas de $($response.accounts.Count) conta(s)."

if (-not $OutFile) {
    $OutFile = ".\simplefin-transactions-$(Get-Date -Format 'yyyy-MM-dd').csv"
}

$rows | Sort-Object date | Export-Csv -Path $OutFile -NoTypeInformation -Encoding UTF8

Write-Host "CSV salvo em $OutFile"

if ($response.errors -and $response.errors.Count -gt 0) {
    Write-Warning "SimpleFin retornou avisos/erros por conta:"
    $response.errors | ForEach-Object { Write-Warning "  - $_" }
}
