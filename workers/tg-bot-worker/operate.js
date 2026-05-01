import { offlineTimeout, commands } from './config'
import { formatBytes, formatUptime, escapeHTML } from '../../lib/format'

function getAllAgentUuid(token) {
    return nodeget(
        "nodeget-server_list_all_agent_uuid",
        { token }
    )
        .then(r => r.result.uuids)
}

const getShortUUid = id => id.replace(/-/g, '').slice(0, 10)

/*
default: uuid => name
reverse: name => uuid
*/
function getAgentNameMap(token, agentUuids, reverse = false) {
    return nodeget(
        "kv_get_multi_value",
        {
            token,
            namespace_key: agentUuids.map(v => ({
                key: "metadata_name",
                namespace: v
            }))
        }
    )
        .then(r => r.result)
        .then(r => new Map(
            r.filter(v => v.key === "metadata_name")
                .map(v => [v.namespace, v.value || getShortUUid(v.namespace)])
                .map(v => reverse ? [v[1], v[0]] : v)
        ))
}

function getDynamicMultiLast(token, agentUuids) {
    return nodeget(
        "agent_dynamic_data_multi_last_query",
        {
            token,
            uuids: agentUuids,
            fields: ["cpu"]
        },
    )
        .then(r => r.result)
}

function getDynamicLast(token, agentUUID) {
    return nodeget(
        "agent_query_dynamic",
        {
            token,
            "dynamic_data_query":{
                fields: ["cpu", "ram", "load", "system", "disk", "network", "gpu"],
                "condition": [
                    "last",
                    {
                        "uuid":agentUUID
                    }
                ]
            }
        },
    )
        .then(r => r.result)
}
function getStaticLast(token, agentUUID) {
    return nodeget(
        "agent_query_static",
        {
            token,
            "static_data_query":{
                fields: ["cpu", "system", "gpu"],
                "condition": [
                    "last",
                    {
                        "uuid":agentUUID
                    }
                ]
            }
        },
    )
        .then(r => r.result)
}

export async function listServers(token) {
    const agentUuids = await getAllAgentUuid(token)
    agentUuids.sort((a, b) => a < b ? -1 : 1)

    const agentNameMap = await getAgentNameMap(token, agentUuids)

    const agentInfoList = agentUuids.map((v, i) => {
        const name = agentNameMap.get(v) || getShortUUid(v)
        return `<b>${(i).toString().padStart(6)}</b>\t${escapeHTML(name)}`
    })

    return {
        parse_mode: "HTML",
        text:
            `💡 节点列表

编号\t名称
${agentInfoList.join('\n')}
`
    }
}

export async function getServerUUID(token, server) {
    const agentUuids = await getAllAgentUuid(token)

    agentUuids.sort((a, b) => a < b ? -1 : 1)

    const agentNameRevMap = await getAgentNameMap(token, agentUuids, true)

    const isUUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.test(server)
    const isNumber = /^\d+$/.test(server)
    // const isName = !(isNumber || isUUID)

    let uuid
    if(isUUID){
        uuid = server
    }else if(isNumber){
        uuid = agentUuids[parseInt(server)]
    }else {
        uuid = agentNameRevMap.get(server)
    }
  return uuid
}

export async function checkServerStatus(token, server) {
    const agentUuids = await getAllAgentUuid(token)

    agentUuids.sort((a, b) => a < b ? -1 : 1)

    const agentNameRevMap = await getAgentNameMap(token, agentUuids, true)

    const isUUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/.test(server)
    const isNumber = /^\d+$/.test(server)
    // const isName = !(isNumber || isUUID)

    let uuid
    if(isUUID){
        uuid = server
    }else if(isNumber){
        uuid = agentUuids[parseInt(server)]
    }else {
        uuid = agentNameRevMap.get(server)
    }
    if(!uuid){
        return {
            text:'未发现该agent，请使用正确的序号、名称或者uuid'
        }
    }
    
    const lastStaticInfo = await getStaticLast(token, uuid).then(r => r.length ? r[0] : null)
    const lastDynamicInfo = await getDynamicLast(token, uuid).then(r => r.length ? r[0] : null)

    if(!lastDynamicInfo || Date.now() - lastDynamicInfo.timestamp > offlineTimeout){
        const offlineText = `
🖥️ <b>服务器节点状态</b>

🔴 离线`
            return {
            parse_mode: "HTML",
            text:offlineText
        }
    }

    const cpuStatic = lastStaticInfo.cpu
    const sys = lastStaticInfo.system

    const cpuDynamic = lastDynamicInfo.cpu

    const ram = lastDynamicInfo.ram
    const load = lastDynamicInfo.load
    const net = lastDynamicInfo.network
    const disks = lastDynamicInfo.disk

    const cpuModel = cpuStatic.per_core?.[0]?.brand || "Unknown"

    const diskText = disks
        .filter(v=>!v.mount_point.includes("docker"))
        .slice(0,3)
        .map(d=>{
            const used = d.total_space - d.available_space
            return `• <code>${d.mount_point}</code> ${formatBytes(used)} / ${formatBytes(d.total_space)}`
        })
        .join("\n")

    const eth0 = net.interfaces.find(v => v.interface_name === "eth0" || v.interface_name.startsWith('ens'))

    const text = `
🖥️ <b>服务器节点状态</b>

🟢 在线

🆔 <b>UUID</b>
<code>${uuid.slice(0,12)}</code>

💻 <b>系统</b>
• <b>OS</b>: ${sys.system_name} ${sys.system_os_version}
• <b>Kernel</b>: ${sys.system_kernel}
• <b>Arch</b>: ${sys.arch}
• <b>Virtualization</b>: ${sys.virtualization}
• <b>Hostname</b>: <code>${sys.system_host_name}</code>

⚙️ <b>CPU</b>
• <b>Model</b>: ${cpuModel}
• <b>Cores</b>: ${cpuStatic.physical_cores}C / ${cpuStatic.logical_cores}T
• <b>Usage</b>: ${(cpuDynamic.total_cpu_usage*100).toFixed(2)}%

🧠 <b>内存</b>
• <b>Used</b>: ${formatBytes(ram.used_memory)}
• <b>Total</b>: ${formatBytes(ram.total_memory)}
• <b>Usage</b>: ${(ram.used_memory/ram.total_memory*100).toFixed(1)}%

💽 <b>磁盘</b>
${diskText}

🌐 <b>网络</b>
• <b>eth0</b> ↓${formatBytes(eth0.receive_speed)}/s ↑${formatBytes(eth0.transmit_speed)}/s
• <b>TCP</b>: ${net.tcp_connections}
• <b>UDP</b>: ${net.udp_connections}

📊 <b>系统</b>
• <b>Load</b>: ${load.one} / ${load.five} / ${load.fifteen}
• <b>Process</b>: ${lastDynamicInfo.system.process_count}
• <b>Uptime</b>: ${formatUptime(lastDynamicInfo.system.uptime)}
`

    return {
        parse_mode: "HTML",
        text
    }
}

export async function checkAllServerStatus(token) {
    const agentUuids = await getAllAgentUuid(token)

    const agentNameMap = await getAgentNameMap(token, agentUuids)
    const dynamicArray = await getDynamicMultiLast(token, agentUuids)

    const onlineUuids = dynamicArray.filter(v => Date.now() - v.timestamp < offlineTimeout).map(v => v.uuid)
    const onlineUuidSet = new Set(onlineUuids)
    const online = onlineUuids.map(id => agentNameMap.get(id))
    const offline = agentUuids.filter(id => !onlineUuidSet.has(id)).map(id => agentNameMap.get(id))

    const total = agentUuids.length
    const onlineCount = online.length
    const offlineCount = offline.length

    const onlineText = online.length
        ? `<blockquote expandable>${online.map(v => '- ' + escapeHTML(v)).join("\n")}</blockquote>`
        : "无"

    const offlineText = offline.length
        ? `<blockquote expandable>${offline.map(v => '- ' + escapeHTML(v)).join("\n")}</blockquote>`
        : "无"

    return {
        parse_mode: "HTML",
        text:
            `💡 服务器节点状态

总节点数: ${total}
在线: ${onlineCount}
离线: ${offlineCount}

🟢 在线节点:
${onlineText}

🔴 离线节点:
${offlineText}`
    }
}

export async function checkStatusChange(token) {

    const namespace = 'global'
    const key = "last_offline_uuids"
    const lastOfflineUuids = await nodeget('kv_get_value', {
        token:token,
        namespace,
        key
    }).then(r => new Set(r.result || []))

    const agentUuids = await getAllAgentUuid(token)
    const agentNameMap = await getAgentNameMap(token, agentUuids)
    const dynamicArray = await getDynamicMultiLast(token, agentUuids)

    const onlineUuids = dynamicArray.filter(v => Date.now() - v.timestamp < offlineTimeout).map(v => v.uuid)
    const offlineUuids = dynamicArray.filter(v => Date.now() - v.timestamp >= offlineTimeout).map(v => v.uuid)

    const recoveredUuids = onlineUuids.filter(v => lastOfflineUuids.has(v))
    const recentOfflineUuids = offlineUuids.filter(v => !lastOfflineUuids.has(v))


    await nodeget("kv_set_value", {
        token:token,
        namespace,
        key,
        value:offlineUuids
    })

    const recentOnline = recoveredUuids.map(id => agentNameMap.get(id))
    const recentOffline = recentOfflineUuids.map(id => agentNameMap.get(id))



    const onlineText = recentOnline.length
        ? `<blockquote expandable>${recentOnline.map(v => '- ' + escapeHTML(v)).join("\n")}</blockquote>`
        : "无"

    const offlineText = recentOffline.length
        ? `<blockquote expandable>${recentOffline.map(v => '- ' + escapeHTML(v)).join("\n")}</blockquote>`
        : "无"

    return {
        parse_mode: "HTML",
        text:
            `💡 服务器节点状态变动

🟢 最近恢复节点:
${onlineText}

🔴 最近离线节点:
${offlineText}`
    }
}