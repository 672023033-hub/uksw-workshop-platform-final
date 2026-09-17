#!/bin/bash
# Bash Remote Deployment Script for SIA.Sat Workshop Platform
# Deploys to 192.168.0.151 (bayu:bayu)

set -e

# Configuration
REMOTE_HOST="192.168.0.151"
REMOTE_USER="bayu"
REMOTE_PASS="bayu"
REMOTE_PATH="/home/bayu/uksw-workshop-platform"
TAR_FILE="deploy.tar.gz"

echo "========================================"
echo " SIA.Sat - Remote Deployment Script (Bash)"
echo " Target: $REMOTE_USER@$REMOTE_HOST"
echo " Remote Path: $REMOTE_PATH"
echo " Note: Credentials are bayu:bayu"
echo "========================================"
echo ""

# Step 0: Dependency Checks
echo "[STEP 0/4] Checking local prerequisites..."
for cmd in tar scp ssh; do
    if ! command -v $cmd &> /dev/null; then
        echo "[ERROR] Required command '$cmd' is not available in PATH. Please install it first."
        exit 1
    fi
done

# Check if sshpass is installed to automate password entry
SSHPASS_CMD=""
if command -v sshpass &> /dev/null; then
    echo "Found sshpass. Password prompt will be automated."
    SSHPASS_CMD="sshpass -p $REMOTE_PASS"
else
    echo "sshpass not found. You will be prompted for password '$REMOTE_PASS' twice."
fi
echo "Prerequisites check passed."
echo ""

# Step 1: Packaging Workspace
echo "[STEP 1/4] Packaging local workspace..."
rm -f $TAR_FILE

# Run tar to package everything, excluding unnecessary items
tar --exclude=".git" \
    --exclude="node_modules" \
    --exclude="dist" \
    --exclude=".idea" \
    --exclude=".vscode" \
    --exclude="deploy.tar.gz" \
    -czf $TAR_FILE \
    backend db frontend docker-compose.yml deploy.sh clean-rebuild.sh quickstart.sh

echo "Successfully packaged workspace into $TAR_FILE"
echo ""

# Function to clean up local tar file on exit/error
cleanup() {
    if [ -f "$TAR_FILE" ]; then
        echo "[STEP 4/4] Cleaning up local temporary files..."
        rm -f $TAR_FILE
        echo "Cleaned up local $TAR_FILE."
    fi
}
trap cleanup EXIT

# Step 2: Transfer package
echo "[STEP 2/4] Uploading package to remote server..."
if [ -n "$SSHPASS_CMD" ]; then
    $SSHPASS_CMD scp -P 22 $TAR_FILE "${REMOTE_USER}@${REMOTE_HOST}:/home/bayu/"
else
    echo "--> Enter password '$REMOTE_PASS' when prompted below:"
    scp -P 22 $TAR_FILE "${REMOTE_USER}@${REMOTE_HOST}:/home/bayu/"
fi
echo "Upload completed successfully."
echo ""

# Step 3: Remote execution
echo "[STEP 3/4] Deploying and building on remote server..."
REMOTE_CMD="echo bayu | sudo -S rm -rf $REMOTE_PATH && \
            mkdir -p $REMOTE_PATH && \
            tar -xzf /home/bayu/$TAR_FILE -C $REMOTE_PATH && \
            cd $REMOTE_PATH && \
            export HOST_IP=$REMOTE_HOST && \
            sed -i 's/\r$//' deploy.sh && \
            chmod +x deploy.sh && \
            echo bayu | sudo -S ./deploy.sh && \
            rm -f /home/bayu/$TAR_FILE"

if [ -n "$SSHPASS_CMD" ]; then
    # sshpass with ssh -t (double -t enforces tty allocation)
    $SSHPASS_CMD ssh -t -t -p 22 "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_CMD"
else
    echo "--> Enter password '$REMOTE_PASS' when prompted below:"
    ssh -t -p 22 "${REMOTE_USER}@${REMOTE_HOST}" "$REMOTE_CMD"
fi
echo "Remote deployment completed successfully!"
echo ""

echo "========================================"
echo " Deployment process complete!"
echo " App URL: http://$REMOTE_HOST"
echo "========================================"
echo ""
