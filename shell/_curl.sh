#!/usr/bin/env bash

# GitHub IPv6 映射表
declare -A GITHUB_IPV6_MAP=(
    [github.com]="2a01:4f8:c010:d56::2"
    [api.github.com]="2a01:4f8:c010:d56::3"
    [codeload.github.com]="2a01:4f8:c010:d56::4"
    [ghcr.io]="2a01:4f8:c010:d56::6"
    [pkg.github.com]="2a01:4f8:c010:d56::7"
    [npm.pkg.github.com]="2a01:4f8:c010:d56::7"
    [maven.pkg.github.com]="2a01:4f8:c010:d56::7"
    [nuget.pkg.github.com]="2a01:4f8:c010:d56::7"
    [rubygems.pkg.github.com]="2a01:4f8:c010:d56::7"
    [uploads.github.com]="2a01:4f8:c010:d56::8"
    [objects.githubusercontent.com]="2606:50c0:8000::133"
    [www.objects.githubusercontent.com]="2606:50c0:8000::133"
    [release-assets.githubusercontent.com]="2606:50c0:8000::133"
    [gist.githubusercontent.com]="2606:50c0:8000::133"
    [repository-images.githubusercontent.com]="2606:50c0:8000::133"
    [camo.githubusercontent.com]="2606:50c0:8000::133"
    [private-user-images.githubusercontent.com]="2606:50c0:8000::133"
    [avatars0.githubusercontent.com]="2606:50c0:8000::133"
    [avatars1.githubusercontent.com]="2606:50c0:8000::133"
    [avatars2.githubusercontent.com]="2606:50c0:8000::133"
    [avatars3.githubusercontent.com]="2606:50c0:8000::133"
    [cloud.githubusercontent.com]="2606:50c0:8000::133"
    [desktop.githubusercontent.com]="2606:50c0:8000::133"
    [support.github.com]="2606:50c0:8000::133"
    [support-assets.githubassets.com]="2606:50c0:8000::154"
    [github.githubassets.com]="2606:50c0:8000::154"
    [opengraph.githubassets.com]="2606:50c0:8000::154"
    [github-registry-files.githubusercontent.com]="2606:50c0:8000::154"
    [github-cloud.githubusercontent.com]="2606:50c0:8000::154"
)

# 检测 IPv4 可用性
check_ipv4() {
    if ping -4 -c 1 -W 2 github.com >/dev/null 2>&1; then
        unset GITHUB_IPV4_UNREACHABLE
    else
        export GITHUB_IPV4_UNREACHABLE=1
    fi
}

# 封装 curl
_curl() {
    # 第一次调用时检查 IPv4
    if [ -z "${_CURL_IPV4_CHECK_DONE}" ]; then
        check_ipv4
        _CURL_IPV4_CHECK_DONE=1
    fi

    local args=("$@")
    local resolve_args=()

    if [ "${GITHUB_IPV4_UNREACHABLE}" = "1" ]; then
        # 构建 --resolve 参数列表
        for host in "${!GITHUB_IPV6_MAP[@]}"; do
            resolve_args+=(--resolve "${host}:443:${GITHUB_IPV6_MAP[$host]}")
        done
    fi

    # 调用 curl，优先使用 resolve 覆盖
    curl "${resolve_args[@]}" "${args[@]}"
}