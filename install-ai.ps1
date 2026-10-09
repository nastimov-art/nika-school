# Установка AI-учителя для «Учимся с Никой» на ноутбук Киры (Windows 10/11).
# Что делает: ставит Ollama, разрешает сайту школы к ней обращаться, скачивает модель, проверяет.
# Запуск (PowerShell, права администратора не нужны):
#   iwr https://nastimov-art.github.io/nika-school/install-ai.ps1 -OutFile $env:TEMP\install-ai.ps1; powershell -ExecutionPolicy Bypass -File $env:TEMP\install-ai.ps1
# Только проверить, что уже стоит:  ... -File install-ai.ps1 -Check

param([switch]$Check)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'          # без полосы загрузки, иначе скачивание в PowerShell 5 очень медленное
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

$Site   = 'https://nastimov-art.github.io'
$Model  = 'qwen3:4b-instruct'
$Api    = 'http://localhost:11434'
$Setup  = 'https://ollama.com/download/OllamaSetup.exe'

function Say($t)  { Write-Host "  $t" }
function Step($n, $t) { Write-Host ""; Write-Host "[$n] $t" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  OK  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  !   $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host ""; Write-Host "  СТОП: $t" -ForegroundColor Red; Write-Host ""; Read-Host "Нажмите Enter, чтобы закрыть"; exit 1 }

function Find-Ollama {
    $cmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in @("$env:LOCALAPPDATA\Programs\Ollama\ollama.exe", "$env:ProgramFiles\Ollama\ollama.exe")) { if (Test-Path $p) { return $p } }
    return $null
}
function Api-Up {
    try { Invoke-RestMethod "$Api/api/tags" -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}
function Wait-Api($sec) {
    for ($i = 0; $i -lt $sec; $i++) { if (Api-Up) { return $true }; Start-Sleep -Seconds 1 }
    return $false
}

Write-Host ""
Write-Host "=== AI-учитель для «Учимся с Никой» ===" -ForegroundColor Magenta
Say "Компьютер: $env:COMPUTERNAME. Займёт около 15-20 минут, в основном загрузка (около 2,5 ГБ)."
Say "Если загрузка не начнётся или оборвётся, включите VPN и запустите скрипт ещё раз: он продолжит с того же места."

# --- 0. Сведения о компьютере ---
try {
    $ram = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    $gpu = (Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) -join '; '
    Say "Память: $ram ГБ. Видеокарта: $gpu"
    if ($ram -lt 8) { Warn "Памяти меньше 8 ГБ: учитель может работать медленно." }
} catch {}

if ($Check) {
    Step 'проверка' 'Что уже установлено'
    $exe = Find-Ollama
    if ($exe) { Ok "Ollama: $exe" } else { Warn 'Ollama не установлена' }
    $env1 = [Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS', 'User')
    if ($env1 -like "*nastimov-art*") { Ok "OLLAMA_ORIGINS = $env1" } else { Warn 'OLLAMA_ORIGINS не задана' }
    if (Api-Up) {
        $names = (Invoke-RestMethod "$Api/api/tags").models | ForEach-Object { $_.name }
        if ($names -contains $Model) { Ok "Модель $Model скачана" } else { Warn "Модели $Model нет. Есть: $($names -join ', ')" }
    } else { Warn 'Ollama не запущена' }
    exit 0
}

# --- 1. Установка Ollama ---
Step '1 из 5' 'Установка Ollama'
$exe = Find-Ollama
if ($exe) {
    Ok "Уже установлена: $exe"
} else {
    $inst = Join-Path $env:TEMP 'OllamaSetup.exe'
    Say 'Скачиваю установщик (около 1 ГБ)...'
    try { Invoke-WebRequest -Uri $Setup -OutFile $inst -UseBasicParsing }
    catch {
        Warn 'Не получилось скачать напрямую. Пробую через winget...'
        $wg = Get-Command winget -ErrorAction SilentlyContinue
        if ($wg) { winget install --id Ollama.Ollama -e --accept-package-agreements --accept-source-agreements | Out-Host }
        else { Fail 'Не получилось скачать установщик. Включите VPN и запустите скрипт ещё раз.' }
    }
    if (Test-Path $inst) {
        Say 'Устанавливаю...'
        Start-Process -FilePath $inst -ArgumentList '/SILENT', '/NORESTART' -Wait
    }
    $exe = Find-Ollama
    if (-not $exe) { Fail 'Ollama не установилась. Скачайте её вручную с ollama.com/download/windows и запустите скрипт ещё раз.' }
    Ok "Установлена: $exe"
}

# --- 2. Разрешить сайту школы ---
Step '2 из 5' 'Разрешаю сайту школы обращаться к Ollama'
[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS', $Site, 'User')
$env:OLLAMA_ORIGINS = $Site
Ok "OLLAMA_ORIGINS = $Site"

# --- 3. Перезапуск Ollama, чтобы настройка вступила в силу ---
Step '3 из 5' 'Запускаю Ollama'
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'ollama*' } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
$tray = Join-Path (Split-Path $exe) 'ollama app.exe'
if (Test-Path $tray) { Start-Process -FilePath $tray -WindowStyle Hidden } else { Start-Process -FilePath $exe -ArgumentList 'serve' -WindowStyle Hidden }
if (-not (Wait-Api 40)) { Fail 'Ollama не отвечает. Перезагрузите компьютер и запустите скрипт ещё раз.' }
Ok 'Ollama запущена'

# --- 4. Модель ---
Step '4 из 5' "Скачиваю модель $Model (около 2,5 ГБ)"
$have = (Invoke-RestMethod "$Api/api/tags").models | ForEach-Object { $_.name }
if ($have -contains $Model) {
    Ok 'Модель уже скачана'
} else {
    $done = $false
    for ($try = 1; $try -le 3 -and -not $done; $try++) {
        if ($try -gt 1) { Warn "Повторная попытка $try из 3 (докачка продолжится с места остановки)..." }
        & $exe pull $Model
        if ($LASTEXITCODE -eq 0) { $done = $true }
    }
    if (-not $done) { Fail 'Модель не скачалась. Включите VPN и запустите скрипт ещё раз: загрузка продолжится.' }
    Ok 'Модель скачана'
}

# --- 5. Проверка ---
Step '5 из 5' 'Проверяю, что всё работает'
$problems = 0
try {
    $r = Invoke-WebRequest "$Api/api/tags" -Headers @{ Origin = $Site } -UseBasicParsing
    $allow = $r.Headers['Access-Control-Allow-Origin']
    if ($allow) { Ok "Сайт школы допущен ($allow)" } else { Warn 'Сайт школы не допущен: перезагрузите компьютер и запустите скрипт ещё раз'; $problems++ }
} catch { Warn "Проверка допуска не удалась: $($_.Exception.Message)"; $problems++ }
try {
    $body = @{ model = $Model; stream = $false; messages = @(@{ role = 'user'; content = 'Скажи одним коротким предложением по-русски: привет, меня зовут Ника.' }) } | ConvertTo-Json -Depth 5
    $resp = Invoke-RestMethod "$Api/api/chat" -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'application/json; charset=utf-8' -TimeoutSec 180
    Ok "Модель отвечает: $($resp.message.content.Trim())"
} catch { Warn "Модель не ответила: $($_.Exception.Message)"; $problems++ }

Write-Host ""
if ($problems -eq 0) {
    Write-Host "ГОТОВО." -ForegroundColor Green
    Say "Теперь откройте сайт школы в браузере Киры: кабинет мамы (шестерёнка) -> «AI-учитель на этом компьютере»"
    Say "-> «Сохранить и проверить». Должно появиться: «На связи». Если браузер спросит про доступ к устройствам в сети, нажмите «Разрешить»."
} else {
    Write-Host "Есть замечания выше. Перезагрузите компьютер и запустите скрипт ещё раз. Если не помогло, пришлите этот текст Claude." -ForegroundColor Yellow
}
Write-Host ""
Read-Host "Нажмите Enter, чтобы закрыть"
