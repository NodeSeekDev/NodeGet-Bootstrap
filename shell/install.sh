#!/usr/bin/env bash
# Manage NodeGet server/agent
# Github: https://github.com/nodeseekdev

set -e

action=""
arch=""
os=""
binary_file=""
dashboard_url="${dashboard_url:-https://dash.nodeget.com}"
install_script_url="${install_script_url:-https://install.nodeget.com}"
releases_url="${releases_url:-https://install.nodeget.com}"

if [ -z "$releases_tag" ]; then
    releases_tag="$( curl -sI https://github.com/NodeSeekDev/NodeGet/releases/latest \
        | sed -n 's#.*tag/\(.*\)\r#\1#p')"
fi

function _red() {
    echo -e "\033[0;31m$1\033[0m"
}

function _yellow() {
    echo -e "\033[0;33m$1\033[0m"
}

function _blue() {
    echo -e "\033[0;36m$1\033[0m"
}

function _green() {
    echo -e "\033[0;32m$1\033[0m"
}

function _red_bold() {
    echo -e "\033[1;31m$1\033[0m"
}

function _yellow_bold() {
    echo -e "\033[1;33m$1\033[0m"
}

function _blue_bold() {
    echo -e "\033[1;36m$1\033[0m"
}

function _green_bold() {
    echo -e "\033[1;32m$1\033[0m"
}

########################################
# 检测系统
########################################
detect_env() {

    os="$(uname -s | tr '[:upper:]' '[:lower:]')"

    # 架构
    case "$(uname -m)" in
        x86_64|amd64)
            arch="x86_64"
            ;;
        aarch64|arm64)
            arch="aarch64"
            ;;
        armv7l)
            arch="armv7"
            ;;
        armv6l)
            arch="arm"
            ;;
        i386|i686)
            arch="i686"
            ;;
        *)
            _red "不支持的架构: $(uname -m)"
            exit 1
            ;;
    esac

    # libc 检测（glibc vs musl）
    if ldd --version 2>&1 | grep -qi musl; then
        libc="musl"
    else
        libc="gnu"
    fi

    # glibc 版本检测（仅 gnu 时）
    if [ "$libc" = "gnu" ]; then
        glibc_version=$(
            ldd --version 2>/dev/null \
            | head -n1 \
            | grep -oE '[0-9]+\.[0-9]+' \
            | head -n1
        )

        required="2.25"

        # sort -V 做语义版本比较
        lowest=$(printf '%s\n%s\n' "$required" "$glibc_version" | sort -V | head -n1)

        if [ "$lowest" != "$required" ]; then
            echo "glibc >= $required required, current: $glibc_version, change to musl"
            libc=musl
        fi
    fi

    # arm ABI（只在 arm / armv7 下需要）
    abi=""
    if [[ "$arch" == arm* ]]; then
        if ldd --version 2>&1 | grep -qi 'hard float'; then
            abi="hf"
        else
            abi=""
        fi
    fi
}

########################################
# 选择二进制文件
########################################
select_binary() {

    case "$action" in
        install-server|uninstall-server|update-server)
            binary_file="nodeget-server"
            ;;
        install-agent|uninstall-agent|update-agent)
            binary_file="nodeget-agent"
            ;;
    esac

    # 拼接 target
    target="${arch}-${libc}"

    # ARM 特殊处理（带 abi）
    if [[ "$arch" == arm* ]]; then
        case "$arch" in
            armv7)
                target="armv7-${libc}eabi${abi}"
                ;;
            arm)
                target="arm-${libc}eabi${abi}"
                ;;
        esac
    fi

    binary_file="${binary_file}-linux-${target}"
}

########################################
# 安装 server
########################################
install_server() {

    echo
    if [ -z "$ws_listener" ]; then
        read -rp "请输入 WS 监听地址 (默认 0.0.0.0:2211): " ws_listener
        ws_listener=${ws_listener:-"0.0.0.0:2211"}
    fi

    if [ -z "$server_uuid" ]; then
        read -rp "请输入 Server UUID (默认自动生成): " server_uuid
        server_uuid=${server_uuid:-"auto_gen"}
    fi

    if [ -z "$db_url" ]; then
        read -rp "请输入 Postgres 数据库 URL (留空则选择sqlite): " db_url
    fi

    if [ -z "$create_quick_tunnel" ]; then
        read -rp "是否利用cloudflare tunnel创建快速预览链接 (y/n, 默认y): " create_quick_tunnel
        create_quick_tunnel=${create_quick_tunnel:-"y"}
        [ "$create_quick_tunnel" = "y" ] && create_quick_tunnel="true" || create_quick_tunnel="false"
    fi
    echo

    select_binary

    echo "正在安装 server 二进制: $binary_file"

    app_manage server install serve

    echo
    echo "正在下载配置文件..."

    curl -s -o /etc/nodeget-server.conf "${install_script_url}/config/nodeget-server.toml"

    echo "正在修改配置..."

    sed -i 's/\r//g' /etc/nodeget-server.conf
    sed -i "s|ws_listener =.*|ws_listener = \"$ws_listener\"|" /etc/nodeget-server.conf
    sed -i "s|server_uuid =.*|server_uuid = \"$server_uuid\"|" /etc/nodeget-server.conf

    if [ -n "$db_url" ]; then
        sed -i "s|database_url =.*|database_url = \"$db_url\"|" /etc/nodeget-server.conf
    fi


    echo "正在启动服务..."

    nodeget-server init -c /etc/nodeget-server.conf &> tmp-nodeget-server.log
    while read -r line; do
        case "$line" in
            *"Super Token:"*) token=${line##*Super Token: } ;;
            *"Root Password:"*) account_password=${line##*Root Password: } ;;
        esac
    done < tmp-nodeget-server.log
    rm tmp-nodeget-server.log
    final_server_uuid=$(nodeget-server get-uuid -c /etc/nodeget-server.conf | tail -n 1)
    my_ip=$(curl -4fsS https://ip.nodeget.com/ip || curl -6fsS https://ip.nodeget.com/ip)

    service nodeget-server restart || true #to-do 其他init系统

    echo
    _yellow "✅ Server 安装完成"
    _yellow "下面的Token和密码都只显示一次，请及时保存"
    _green "Token: $token"
    _green "用户名: root"
    _green "密码: $account_password"
    _green "服务器UUID: $final_server_uuid"
    _green "服务器 IP: $my_ip"
    echo


    if [ "$create_quick_tunnel" = "true" ]; then
        start_quick_tunnel
        fast_dashboard_entry='{"name":"'"$(hostname -s)"'", "url":"wss://'"${quick_tunnel_host}"'", "token":"'"${token}"'"}'
        echo "可以通过下面的预览url快速添加服务器到面板"
        _green "$dashboard_url/#/dashboard/node-manage?tab=servers&fill=$(echo $fast_dashboard_entry | base64 -w 0)"

        echo
        _yellow "注意预览url在主控server重启后自动消失，仅用于快速体验NodeGet"
        _yellow "如需要长期使用，请按照教程 https://nodeget.com/guide/install/install-script.html 替换预览url为正式url"
    fi



    exit 0
}

########################################
# 安装 agent
########################################
install_agent() {

    echo
    if [ -z "$server_ws" ]; then
        read -rp "请输入 Server WS 地址: " server_ws
    fi

    if [ -z "$server_uuid" ]; then
        read -rp "请输入 Server UUID: " server_uuid
    fi

    if [ -z "$token" ]; then
        read -rp "请输入授权 Token: " token
    fi

    if [ -z "$server_name" ]; then
        read -rp "请输入主控 Server 名称 (默认随机): " server_name
        agent_name=${server_name:-"server-$RANDOM"}
    fi

    if [ -z "$agent_uuid" ]; then
        read -rp "请输入 Agent UUID: " agent_uuid
    fi
    echo

    select_binary

    echo "正在安装 agent 二进制: $binary_file"

    app_manage agent install

    echo "正在下载配置文件..."

    curl -s -o /etc/nodeget-agent.conf "${install_script_url}/config/nodeget-agent.toml"

    echo "正在修改配置..."

    sed -i 's/\r//g' /etc/nodeget-agent.conf
    sed -i "s|ws_url =.*|ws_url = \"$server_ws\"|" /etc/nodeget-agent.conf
    sed -i "s|^server_uuid =.*|server_uuid = \"$server_uuid\"|" /etc/nodeget-agent.conf
    sed -i "s|token =.*|token = \"$token\"|" /etc/nodeget-agent.conf
    sed -i "s|agent_uuid =.*|agent_uuid = \"$agent_uuid\"|" /etc/nodeget-agent.conf
    sed -i "s|name = .*|name = \"$server_name\"|" /etc/nodeget-agent.conf

    service nodeget-agent restart || true #to-do 其他init系统
    _yellow "✅ Agent 安装完成"
    _yellow "你可以在下面的链接修改此agent的设置"
    _green  "$dashboard_url/#/dashboard/node/${agent_uuid}/setting"

    exit 0
}

########################################
# 卸载 server
########################################
uninstall_server() {

    select_binary

    service nodeget-server stop
    app_manage server uninstall


    _green "✅ Server 卸载完成"
    mv /var/lib/nodeget-server{,.backup}
    _yellow "[提醒] Server数据备份保留在 /var/lib/nodeget-server.backup "

    exit 0
}

########################################
# 卸载 agent
########################################
uninstall_agent() {

    select_binary

    service nodeget-agent stop
    app_manage agent uninstall

    _green "✅ Agent 卸载完成"

    exit 0
}

########################################
# 升级 server
########################################
upgrade_server() {

    select_binary

    app_manage server upgrade serve
    service nodeget-server restart


    _green "✅ Server 升级完成"

    exit 0
}

########################################
# 升级 agent
########################################
upgrade_agent() {

    select_binary

    app_manage agent upgrade
    service nodeget-agent restart

    _green "✅ Agent 升级完成"

    exit 0
}

########################################
# 快捷隧道
########################################
start_quick_tunnel() {
    curl -Lso /usr/local/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
    chmod u+x /usr/local/cloudflared
    local LOG_FILE="/tmp/cloudflared_$$.log"
    local quick_tunnel_url=""
    local timeout=20
    local elapsed=0

    echo "🚀 为了方便用户预览使用，将创建Cloudflare Quick Tunnel"
    echo "📡 请稍候，正在获取临时访问地址（最多等待 ${timeout}s）"

    port_listen="${ws_listener##*:}"
    # 后台运行
    nohup /usr/local/cloudflared tunnel  \
        --url "http://127.0.0.1:${port_listen}" \
        --protocol http2 >"$LOG_FILE" 2>&1 &

    local CF_PID=$!

    # 每秒检测
    while [ $elapsed -lt $timeout ]; do
        if [ -f "$LOG_FILE" ]; then
        quick_tunnel_host=$(grep -oE '[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG_FILE" | head -n1)
        if [ -n "$quick_tunnel_host" ]; then
            echo ""
            echo "✅ Tunnel 已启动成功！"
            echo "🌍 tunnel域名: $quick_tunnel_host"
            return 0
        fi
        fi

        sleep 1
        elapsed=$((elapsed + 1))
        printf "\r⏳ 等待中... %ds / %ds" "$elapsed" "$timeout"
    done

    echo ""
    _yellow "❌ 在 ${timeout}s 内未获取到 trycloudflare 域名"

    if ps -p $CF_PID >/dev/null 2>&1; then
        # echo "⚠️ cloudflared 仍在运行 (PID: $CF_PID)"
        true
    else
        _red "💥 cloudflared 已退出，请检查日志:"
        cat "$LOG_FILE"
    fi

    return 1
}

########################################
# 菜单
########################################
app_manage(){
    target="$1"
    task="$2"
    args="$3"

    APP_NAME="nodeget-${target}" \
    APP_USER=root \
    BIN_NAME="nodeget-${target}" \
    DOWNLOAD_URL="${releases_url}/releases/${binary_file}?tag=${releases_tag}" \
    START_AFTER_INSTALL=false \
    SERVICE_ARGS="${args} -c /etc/nodeget-${target}.conf" \
    bash <(curl -s "${install_script_url}/install-daemon.sh") "$task"
}

########################################
# 菜单
########################################
menu() {

    echo
    echo "================================"
    echo "        NodeGet 管理脚本"
    echo "================================"
    echo
    echo "1. 安装 Server"
    echo "2. 卸载 Server"
    echo "3. 更新 Server"
    echo "4. 查看 Server UUID"
    echo
    echo "5. 安装 Agent"
    echo "6. 卸载 Agent"
    echo "7. 更新 Agent"
    echo
    echo "0. 退出"
    echo
    read -rp "请输入选项: " choice

    case "$choice" in
        1) action="install-server" ;;
        2) action="uninstall-server" ;;
        3) action="update-server" ;;
        4) action="show-server-uuid" ;;
        5) action="install-agent" ;;
        6) action="uninstall-agent" ;;
        7) action="update-agent" ;;
        0) exit 0 ;;
    esac
}

########################################
# 参数解析
########################################
parse_args() {

    action="$1"
    shift || true

    case "$action" in

        install-server)

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --server-ws|--server_ws)
                        ws_listener="$2"
                        shift 2
                        ;;
                    --server-id)
                        server_uuid="$2"
                        shift 2
                        ;;
                    --db)
                        db_url="$2"
                        shift 2
                        ;;
                    --tunnel)
                        create_quick_tunnel="$2"
                        shift 2
                        ;;
                    *)
                        _red "未知参数: $1"
                        exit 1
                        ;;
                esac
            done
            ;;

        install-agent)

            while [[ $# -gt 0 ]]; do
                case "$1" in
                    --server-ws)
                        server_ws="$2"
                        shift 2
                        ;;
                    --server-name)
                        server_name="$2"
                        shift 2
                        ;;
                    --token)
                        token="$2"
                        shift 2
                        ;;
                    --agent-id)
                        agent_uuid="$2"
                        shift 2
                        ;;
                    --server-id)
                        server_uuid="$2"
                        shift 2
                        ;;
                    *)
                        _red "未知参数: $1"
                        exit 1
                        ;;
                esac
            done
            ;;
    esac
}

########################################
# 用法
########################################
usage() {
cat <<'EOF'
Usage:
  install.sh <command> [options]

Commands:
  install-server         安装服务端
  install-agent          安装客户端
  update-server          升级服务端
  update-agent           升级客户端
  uninstall-server       卸载服务端
  uninstall-agent        卸载客户端
  help                   显示帮助

----------------------------------------
install-server 选项:

  --server-ws <addr>     WebSocket 监听地址 (默认: 0.0.0.0:2211)
  --server-id <uuid>     服务端 ID (可选，默认自动生成)
  --db <url>             postgres/sqlite数据库连接字符串 (默认采用sqlite)
  --tunnel <true|false>  是否创建 Cloudflare 临时隧道

----------------------------------------
install-agent 选项:

  --server-ws <url>      服务端 WebSocket 地址 (必填)
  --server-name <name>   节点名称 (默认: 主机名)
  --token <token>        认证 Token (必填)
  --agent-id <uuid>      客户端 ID (可选，默认自动生成)
  --server-id <uuid>     绑定的服务端 ID (可选)

----------------------------------------
示例:

  # 交互模式
  ./install.sh

  # 安装 Server
  ./install.sh install-server \
    --server-ws 0.0.0.0:2211 \
    --db sqlite://nodeget.db?mode=rwc

  # 安装 Agent
  ./install.sh install-agent \
    --server-ws ws://example.com:2211 \
    --token YOUR_TOKEN

EOF
}

########################################
# 主逻辑
########################################

detect_env

if [ $# -gt 0 ]; then
    parse_args "$@"
fi


while true; do
    case "$action" in
        install-server) install_server ;;
        install-agent) install_agent ;;
        uninstall-server) uninstall_server ;;
        uninstall-agent) uninstall_agent ;;
        update-server) upgrade_server ;;
        update-agent) upgrade_agent ;;
        show-server-uuid) nodeget-server get-uuid -c /etc/nodeget-server.conf | tail -n -1;;
        *) usage ;;
    esac
    menu
done
