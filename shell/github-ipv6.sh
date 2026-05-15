#!/usr/bin/env bash

# 检测 IPv4 是否可访问 GitHub
check_ipv4() {
    # ping github.com 的 IPv4 地址，超时 2 秒，发 1 个包
    if ping -4 -c 1 -W 2 github.com >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# 添加 hosts 条目
add_github_ipv6_hosts() {
    local hosts_file="/etc/hosts"
    local tmp_file
    tmp_file=$(mktemp)

    cat <<'EOF' > "$tmp_file"
# GitHub IPv6 entries
2a01:4f8:c010:d56::2 github.com
2a01:4f8:c010:d56::3 api.github.com
2a01:4f8:c010:d56::4 codeload.github.com
2a01:4f8:c010:d56::6 ghcr.io
2a01:4f8:c010:d56::7 pkg.github.com npm.pkg.github.com maven.pkg.github.com nuget.pkg.github.com rubygems.pkg.github.com
2a01:4f8:c010:d56::8 uploads.github.com
2606:50c0:8000::133 objects.githubusercontent.com www.objects.githubusercontent.com release-assets.githubusercontent.com gist.githubusercontent.com repository-images.githubusercontent.com camo.githubusercontent.com private-user-images.githubusercontent.com avatars0.githubusercontent.com avatars1.githubusercontent.com avatars2.githubusercontent.com avatars3.githubusercontent.com cloud.githubusercontent.com desktop.githubusercontent.com support.github.com
2606:50c0:8000::154 support-assets.githubassets.com github.githubassets.com opengraph.githubassets.com github-registry-files.githubusercontent.com github-cloud.githubusercontent.com
EOF

    echo "需要使用 sudo 权限来修改 $hosts_file"
    sudo sh -c "cat '$tmp_file' >> '$hosts_file'"
    rm -f "$tmp_file"
    echo "GitHub IPv6 hosts 已添加"
}

main() {
    if check_ipv4; then
        echo "IPv4 可用，无需添加 IPv6 hosts。"
        exit 0
    else
        echo "检测到 IPv4 不可用。"
        # 如果环境变量设置了跳过交互
        if [ "$GITHUB_IPV6_SKIP_PROMPT" = "1" ]; then
            echo "环境变量 GITHUB_IPV6_SKIP_PROMPT=1，直接添加 hosts"
            add_github_ipv6_hosts
        else
            read -rp "是否需要添加 GitHub IPv6 hosts 以访问 GitHub? [y/N]: " ans
            case "$ans" in
                [Yy]*) add_github_ipv6_hosts ;;
                *) echo "跳过 hosts 修改" ;;
            esac
        fi
    fi
}

main