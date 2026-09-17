# PowerShell Remote Deployment Script for SIA.Sat Workshop Platform
# Deploys to 192.168.0.151 (bayu:bayu)

$ErrorActionPreference = "Stop"

# Configuration
$RemoteHost = "192.168.0.151"
$RemoteUser = "bayu"
$RemotePath = "/home/bayu/uksw-workshop-platform"
$TarFile = "deploy.tar.gz"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " SIA.Sat - Remote Deployment Script" -ForegroundColor Cyan
Write-Host " Target: $RemoteUser@$RemoteHost" -ForegroundColor Cyan
Write-Host " Remote Path: $RemotePath" -ForegroundColor Cyan
Write-Host " Note: Credentials are bayu:bayu" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 0: Dependency Checks
Write-Host "[STEP 0/4] Checking local prerequisites..." -ForegroundColor Yellow
$Prereqs = @("tar", "scp", "ssh")
foreach ($cmd in $Prereqs) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Error "Required command '$cmd' is not available in PATH. Please install it first."
        exit 1
    }
}
Write-Host "Prerequisites check passed." -ForegroundColor Green
Write-Host ""

# Step 1: Packaging Workspace
Write-Host "[STEP 1/4] Packaging local workspace..." -ForegroundColor Yellow
if (Test-Path $TarFile) {
    Remove-Item $TarFile -Force
}

# Run tar.exe to package everything, excluding unnecessary items
try {
    tar.exe --exclude=".git" `
            --exclude="node_modules" `
            --exclude="dist" `
            --exclude=".idea" `
            --exclude=".vscode" `
            --exclude="deploy.tar.gz" `
            -czf $TarFile `
            backend db frontend docker-compose.yml deploy.sh clean-rebuild.sh quickstart.sh
            
    Write-Host "Successfully packaged workspace into $TarFile" -ForegroundColor Green
} catch {
    Write-Error "Failed to package workspace. Error: $_"
    exit 1
}
Write-Host ""

# Step 2: Transfer package
Write-Host "[STEP 2/4] Uploading package to remote server..." -ForegroundColor Yellow
Write-Host "--> Enter password 'bayu' when prompted below:" -ForegroundColor Magenta
try {
    scp.exe -P 22 $TarFile "${RemoteUser}@${RemoteHost}:/home/bayu/"
    Write-Host "Upload completed successfully." -ForegroundColor Green
} catch {
    Write-Host "Failed to upload package." -ForegroundColor Red
    if (Test-Path $TarFile) { Remove-Item $TarFile -Force }
    exit 1
}
Write-Host ""

# Step 3: Remote execution
Write-Host "[STEP 3/4] Deploying and building on remote server..." -ForegroundColor Yellow
Write-Host "--> Enter password 'bayu' when prompted below:" -ForegroundColor Magenta

# Commands to run on remote
$RemoteCmd = "echo bayu | sudo -S rm -rf $RemotePath && " +
             "mkdir -p $RemotePath && " +
             "tar -xzf /home/bayu/$TarFile -C $RemotePath && " +
             "cd $RemotePath && " +
             "export HOST_IP=$RemoteHost && " +
             "sed -i 's/\r$//' deploy.sh && " +
             "chmod +x deploy.sh && " +
             "echo bayu | sudo -S ./deploy.sh && " +
             "rm -f /home/bayu/$TarFile"

try {
    # -t enforces pseudo-terminal allocation so we see live output/formatting
    ssh.exe -t -p 22 "${RemoteUser}@${RemoteHost}" $RemoteCmd
    Write-Host "Remote deployment completed successfully!" -ForegroundColor Green
} catch {
    Write-Error "Failed during remote deployment. Error: $_"
}
Write-Host ""

# Step 4: Cleanup local
Write-Host "[STEP 4/4] Cleaning up local temporary files..." -ForegroundColor Yellow
if (Test-Path $TarFile) {
    Remove-Item $TarFile -Force
    Write-Host "Cleaned up local $TarFile." -ForegroundColor Green
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Deployment process complete!" -ForegroundColor Cyan
Write-Host " App URL: http://$RemoteHost" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
