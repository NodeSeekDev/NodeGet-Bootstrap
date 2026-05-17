#!/usr/bin/env bash
# Non-Root User-level binary installer with crontab/nohup daemon
# Github: https://github.com/nodeseekdev

set -e

# 基础变量设置
APP_NAME="${APP_NAME:-myapp}"
BIN_NAME="${BIN_NAME:-myapp}"
SERVICE_ARGS="${SERVICE_ARGS:-}"

# 路径设置 (全部位于当前用户家目录下)
INSTALL_DIR="$HOME/.local/bin"
LOG_DIR="$HOME/.local/log/$APP_NAME"
DATA_DIR="$HOME/.local/share/$APP_NAME"
TMP_DIR="$HOME/.tmp"
LOCK_FILE="$TMP_DIR/$APP_NAME-user.lock"

DOWNLOAD_URL="${DOWNLOAD_URL:-}"
ACTION="${1:-install}"

########################################
# 权限检查：确保不是以 root 身份运行
########################################

if [ "$(id -u)" == "0" ]; then
    echo "Error: This script is designed for non-root users."
    echo "Please run as a normal user."
    exit 1
fi

########################################
# 目录准备
########################################

create_dirs() {
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$DATA_DIR"
    mkdir -p "$TMP_DIR"
}

########################################
# 安装二进制文件
########################################

install_binary() {
    if [ -n "$DOWNLOAD_URL" ]; then
        TMP=$(mktemp -d)
        echo "Downloading $DOWNLOAD_URL"
        
        # 使用系统自带 curl 或直接调用
        curl -fsL "$DOWNLOAD_URL" -o "$TMP/app"

        if unzip -t "$TMP/app" >/dev/null 2>&1; then
            unzip -o "$TMP/app" -d "$TMP"
            install -m 0755 "$TMP/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
        else
            install -m 0755 "$TMP/app" "$INSTALL_DIR/$BIN_NAME"
        fi
        rm -rf "$TMP"
    else
        if [ -f "./$BIN_NAME" ]; then
            install -m 0755 "./$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
        else
            echo "Error: Binary ./$BIN_NAME not found."
            exit 1
        fi
    fi
}

########################################
# 守护进程管理 (Cron or Nohup)
########################################

deploy_daemon() {
    local cmd="$INSTALL_DIR/$BIN_NAME $SERVICE_ARGS"
    local log="$LOG_DIR/app.log"

    if command -v crontab >/dev/null 2>&1; then
        echo "Detected cron, installing crontab guardian..."
        # 移除旧的 cron 任务防止重复
        (crontab -l 2>/dev/null | grep -v "$BIN_NAME") | crontab - 2>/dev/null || true
        # 添加新的任务：每分钟检查一次，使用 flock 确保单例运行
        (crontab -l 2>/dev/null; echo "* * * * * /usr/bin/flock -xn $LOCK_FILE $cmd >> $log 2>&1") | crontab -
        # 立即手动触发第一次运行
        nohup /usr/bin/flock -xn "$LOCK_FILE" $cmd >> "$log" 2>&1 &
    else
        echo "Cron not found, using nohup fallback..."
        nohup /usr/bin/flock -xn "$LOCK_FILE" $cmd >> "$log" 2>&1 &
        echo $! > "$DATA_DIR/app.pid"
    fi
}

########################################
# 卸载逻辑
########################################

uninstall() {
    echo "Uninstalling $APP_NAME..."

    # 1. 停止进程
    echo "Stopping processes..."
    pkill -af "$BIN_NAME" || true

    # 2. 移除 crontab 任务
    if command -v crontab >/dev/null 2>&1; then
        (crontab -l 2>/dev/null | grep -v "$BIN_NAME") | crontab - 2>/dev/null || true
    fi

    # 3. 删除文件
    rm -f "$INSTALL_DIR/$BIN_NAME"
    rm -rf "$LOG_DIR"
    rm -f "$LOCK_FILE"
    
    echo "Uninstalled successfully."
}

########################################
# 主逻辑控制
########################################

case "$ACTION" in
    install)
        create_dirs
        install_binary
        deploy_daemon
        echo "Installation completed as non-root user."
        echo "Binary: $INSTALL_DIR/$BIN_NAME"
        ;;
    upgrade)
        install_binary
        pkill -f "$INSTALL_DIR/$BIN_NAME" || true
        deploy_daemon
        echo "Upgrade completed."
        ;;
    uninstall)
        uninstall
        ;;
    *)
        echo "Usage: $0 {install|upgrade|uninstall}"
        exit 1
        ;;
esac