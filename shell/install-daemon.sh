#!/usr/bin/env bash
# Install binary software
# Github: https://github.com/nodeseekdev

set -e

APP_NAME="${APP_NAME:-myapp}"
APP_USER="${APP_USER:-myapp}"
BIN_NAME="${BIN_NAME:-myapp}"

INSTALL_DIR="/usr/local/bin"
CONFIG_DIR="/etc/$APP_NAME.d"
LOG_DIR="/var/log/$APP_NAME"
PID_DIR="/var/run/$APP_NAME"
DATA_DIR="/var/lib/$APP_NAME"

SERVICE_NAME="$APP_NAME"
SERVICE_ARGS="${SERVICE_ARGS:-}"

DOWNLOAD_URL="${DOWNLOAD_URL:-}"

ACTION="${1:-install}"
START_AFTER_INSTALL="${1:-true}"

########################################
# root check
########################################

if [ "$(id -u)" != "0" ]; then
    echo "Please run as root"
    exit 1
fi

. <(curl -s "https://bootstrap.nodeget.com/shell/_curl.sh")

########################################
# detect package manager
########################################

detect_pkg_manager() {

    if command -v apt-get >/dev/null; then
        PKG="apt"
    elif command -v dnf >/dev/null; then
        PKG="dnf"
    elif command -v yum >/dev/null; then
        PKG="yum"
    elif command -v apk >/dev/null; then
        PKG="apk"
    elif command -v pacman >/dev/null; then
        PKG="pacman"
    elif command -v zypper >/dev/null; then
        PKG="zypper"
    else
        PKG="unknown"
    fi
}

########################################
# install package
########################################

install_pkg() {

    detect_pkg_manager

    case "$PKG" in
    apt)
        apt-get update
        apt-get install -y "$@"
        ;;
    yum)
        yum install -y "$@"
        ;;
    dnf)
        dnf install -y "$@"
        ;;
    apk)
        apk add --no-cache "$@"
        ;;
    pacman)
        pacman -Sy --noconfirm "$@"
        ;;
    zypper)
        zypper install -y "$@"
        ;;
    *)
        echo "Unsupported package manager"
        exit 1
        ;;
    esac
}

########################################
# ensure dependencies
########################################

ensure_dependencies() {

    if ! command -v curl >/dev/null; then
        echo "Installing curl..."
        install_pkg curl
    fi

    if ! command -v unzip >/dev/null; then
        echo "Installing unzip..."
        install_pkg unzip
    fi
}

########################################
# detect init system
########################################

detect_init() {

    if command -v systemctl >/dev/null 2>&1; then
        INIT="systemd"
    elif command -v rc-service >/dev/null 2>&1; then
        INIT="openrc"
    elif [ -d /etc/init.d ]; then
        INIT="sysvinit"
    else
        INIT="unknown"
    fi
}

########################################
# create user
########################################

create_user() {

    if id "$APP_USER" >/dev/null 2>&1; then
        return
    fi

    echo "Creating user $APP_USER"

    useradd \
        --system \
        --no-create-home \
        --shell /sbin/nologin \
        "$APP_USER"
}

########################################
# directories
########################################

create_dirs() {

    mkdir -p "$CONFIG_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$PID_DIR"
    mkdir -p "$DATA_DIR"

    chown -R "$APP_USER:$APP_USER" "$LOG_DIR"
    chown -R "$APP_USER:$APP_USER" "$PID_DIR"
    chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
}

########################################
# install binary
########################################

install_binary() {

    if [ -n "$DOWNLOAD_URL" ]; then

        TMP=$(mktemp -d)

        echo "Downloading $DOWNLOAD_URL"

        _curl "-fsL#" "$DOWNLOAD_URL" -o "$TMP/app"

        if unzip -t "$TMP/app" >/dev/null 2>&1; then
            unzip -o "$TMP/app" -d "$TMP"
            install -m 0755 "$TMP/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
        else
            install -m 0755 "$TMP/app" "$INSTALL_DIR/$BIN_NAME"
        fi

        rm -rf "$TMP"

    else

        install -m 0755 "./$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"

    fi
}

########################################
# systemd
########################################

install_systemd() {

SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=$APP_NAME service
After=network.target

[Service]
User=$APP_USER
Group=$APP_USER

ExecStart=$INSTALL_DIR/$BIN_NAME $SERVICE_ARGS

Restart=always
RestartSec=5

StandardOutput=append:$LOG_DIR/app.log
StandardError=append:$LOG_DIR/error.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

if [ "$START_AFTER_INSTALL" == "true" ]; then
    systemctl restart "$SERVICE_NAME"
fi

}

########################################
# sysvinit
########################################

install_sysvinit() {

INIT_FILE="/etc/init.d/$SERVICE_NAME"

cat > "$INIT_FILE" <<EOF
#!/bin/sh

DAEMON=$INSTALL_DIR/$BIN_NAME
PIDFILE=$PID_DIR/$APP_NAME.pid

start() {
    echo "Starting $APP_NAME"
    start-stop-daemon --start --background --make-pidfile --pidfile \$PIDFILE --exec \$DAEMON -- "$SERVICE_ARGS"
}

stop() {
    echo "Stopping $APP_NAME"
    start-stop-daemon --stop --pidfile \$PIDFILE
}

restart() {
    stop
    start
}

case "\$1" in
start) start ;;
stop) stop ;;
restart) restart ;;
*) echo "Usage: service $APP_NAME {start|stop|restart}" ;;
esac
EOF

chmod +x "$INIT_FILE"

if command -v update-rc.d >/dev/null 2>&1; then
    update-rc.d "$SERVICE_NAME" defaults
elif command -v chkconfig >/dev/null 2>&1; then
    chkconfig --add "$SERVICE_NAME"
    chkconfig "$SERVICE_NAME" on
fi

if [ "$START_AFTER_INSTALL" == "true" ]; then
    service "$SERVICE_NAME" restart || true
fi

}

########################################
# openrc
########################################

install_openrc() {

INIT_FILE="/etc/init.d/$SERVICE_NAME"

cat > "$INIT_FILE" <<EOF
#!/sbin/openrc-run

command="$INSTALL_DIR/$BIN_NAME"
command_args="$SERVICE_ARGS"
command_user="$APP_USER"
command_background=true
pidfile="$PID_DIR/$APP_NAME.pid"

depend() {
    need net
}
EOF

chmod +x "$INIT_FILE"

rc-update add "$SERVICE_NAME" default

if [ "$START_AFTER_INSTALL" == "true" ]; then
    rc-service "$SERVICE_NAME" restart
fi

}

########################################
# uninstall
########################################

uninstall() {

echo "Uninstalling $APP_NAME"

detect_init

rm -f "$INSTALL_DIR/$BIN_NAME"
rm -rf "$CONFIG_DIR"
rm -rf "$LOG_DIR"

if [ "$INIT" = "systemd" ]; then

    rm -f /etc/systemd/system/$SERVICE_NAME.service
    systemctl disable --now "$SERVICE_NAME" || true
    systemctl daemon-reload

elif [ "$INIT" = "sysvinit" ]; then

    rm -f /etc/init.d/$SERVICE_NAME
    service "$SERVICE_NAME" stop || true

elif [ "$INIT" = "openrc" ]; then

    rm -f /etc/init.d/$SERVICE_NAME
    rc-update del "$SERVICE_NAME" || true
    rc-service "$SERVICE_NAME" stop || true
fi


echo "Uninstalled."

}

########################################
# install
########################################

install_app() {

ensure_dependencies
detect_init
create_user
create_dirs
install_binary

echo "Init system: $INIT"

case "$INIT" in

systemd)
    install_systemd
    ;;

sysvinit)
    install_sysvinit
    ;;

openrc)
    install_openrc
    ;;

*)
    echo "Unsupported init system"
    exit 1
    ;;

esac

echo ""
echo "Installation completed"
echo "Service: $SERVICE_NAME"

}

########################################
# restart
########################################

restart_app() {

ensure_dependencies
detect_init

echo "Init system: $INIT"

case "$INIT" in

systemd)
    systemctl restart "$SERVICE_NAME"
    ;;

sysvinit)
    service "$SERVICE_NAME" restart || true
    ;;

openrc)
    rc-service "$SERVICE_NAME" restart
    ;;

*)
    echo "Unsupported init system"
    exit 1
    ;;

esac

echo ""
echo "Restart completed"
echo "Service: $SERVICE_NAME"

}

########################################
# main
########################################

case "$ACTION" in

install)
    install_app
    ;;

upgrade)
    install_binary
    restart_app
    ;;

uninstall)
    uninstall
    ;;

*)
    echo "Usage: $0 {install|upgrade|uninstall}"
    exit 1
    ;;

esac