
Param(
    [string]$Remote = "origin",
    [string]$ProjectPath = $(Get-Location),
    [switch]$DryRun
)

# If the user passed a relative ProjectPath, resolve it to absolute
$projectPath = Resolve-Path -Path $ProjectPath | Select-Object -ExpandProperty Path

# Default LocalI18nDir location relative to project root
$LocalI18nDir = Join-Path -Path $projectPath -ChildPath 'src\renderer\src\i18n'

Write-Host "Proje yolu: $projectPath"
Write-Host "Yerel i18n kaynağı beklenen konum: $LocalI18nDir"

if (-not (Test-Path $LocalI18nDir)) {
    Write-Error "Beklenen yerel i18n dizini bulunamadı: $LocalI18nDir"
    Write-Host "Eğer çeviri başka bir klasördeyse, scripti düzenleyin veya tr-tr.json'u manuel olarak kopyalayın."
    exit 1
}

$branch = "add/tr-TR-i18n"

# Eğer dal zaten varsa, ona geç; yoksa yeni dal oluştur
$currentBranch = (git rev-parse --abbrev-ref HEAD) 2>$null
if ($currentBranch -ne $branch) {
    if ((git show-ref --verify --quiet "refs/heads/$branch") -eq $false) {
        Write-Host "Yeni branch oluşturuluyor: $branch"
        git checkout -b $branch
    }
    else {
        Write-Host "Branch mevcut, ona geçiliyor: $branch"
        git checkout $branch
    }
}

# Hedef dizin: proje içindeki locales
$targetLocales = Join-Path -Path $projectPath -ChildPath 'src\renderer\src\i18n\locales'
if (-not (Test-Path $targetLocales)) {
    Write-Host "Hedef locales dizini oluşturuluyor: $targetLocales"
    New-Item -ItemType Directory -Force -Path $targetLocales | Out-Null
}

# Kopyalama: mevcut tr-tr.json veya tüm locale içeriği
$sourceTr = Join-Path -Path $LocalI18nDir -ChildPath 'locales\tr-tr.json'
if (-not (Test-Path $sourceTr)) {
    # Eğer klasör içinde locales yoksa, doğrudan LocalI18nDir içindeki dosyayı kontrol et
    $altSource = Join-Path -Path $LocalI18nDir -ChildPath 'tr-tr.json'
    if (Test-Path $altSource) {
        $sourceTr = $altSource
    }
}

if (-not (Test-Path $sourceTr)) {
    Write-Error "tr-tr.json bulunamadı. Aranan yerler: $sourceTr ve alternatif: $altSource"
    exit 1
}

Write-Host "tr-tr.json kaynağı: $sourceTr"

if ($DryRun) {
    Write-Host "DryRun seçeneği açık - aşağıdaki eylemler yapılacaktı:"
    Write-Host "Kopyalanacak: $sourceTr -> $targetLocales\tr-tr.json"
    Write-Host "Branch: $branch (lokal commit + push yapılacak)"
    exit 0
}


Copy-Item -Path $sourceTr -Destination (Join-Path $targetLocales 'tr-tr.json') -Force
Write-Host "Dosya kopyalandı: tr-tr.json -> $targetLocales"

# Only commit if there are changes
if ((git status --porcelain) -ne '') {
    git add src\renderer\src\i18n\locales\tr-tr.json
    try {
        git commit -m "chore(i18n): add Turkish (tr-TR) translations by savasava034" -q
        Write-Host "Commit oluşturuldu."
    }
    catch {
        Write-Host "Commit sırasında hata oluştu; devam ediliyor."
    }
}
else {
    Write-Host "Commit atlanıyor: Değişiklik yok."
}

try {
    git push --set-upstream $Remote $branch
    Write-Host "Branch pushlandı: $branch -> $Remote"
}
catch {
    Write-Warning "Push başarısız oldu. Uzak depoya erişim yetkiniz olmayabilir."
    Write-Host "Alternatif: 'c:\\Desktop\\cherry-studio-desktop\\add-tr-TR-i18n.patch' dosyasını forkunuza uygulayabilirsiniz."
}

Write-Host "İşlem tamamlandı. GitHub üzerinde PR oluşturmak için 'gh pr create' veya web arayüzünü kullanın." 
