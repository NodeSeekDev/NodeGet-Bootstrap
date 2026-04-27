/*
telegram bot for NodeGet

*/

const offlineTimeout = 30 * 1000
const commands = [
    {
        command:'help',
        description:'show help',
    },
    {
        command:'start',
        description:'start and show help',
    },
]

function delay(t) {
    return new Promise(resolve => {
        setTimeout(resolve, t)
    })
}

function escapeHTML(str) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return str.replace(/[&<>"']/g, m => map[m]);
}

class Telegram {
    constructor(botToken, botSecret, metaInfo = {}) {
        this.botToken = botToken
        this.botSecret = botSecret
        this.metaInfo = metaInfo
    }
    apiUrl(method, params = null) {
        let query = ''
        if (params) {
            query = '?' + new URLSearchParams(params).toString()
        }
        return `https://api.telegram.org/bot${this.botToken}/${method}${query}`
    }
    request(method, body, params) {
        return fetch(
            this.apiUrl(method, params),
            {
                method: 'POST',
                body: JSON.stringify(body),
                headers: {
                    'content-type': 'application/json'
                },
            }
        )
    }
    sendMessage(msg) {
        return this.request('sendMessage', msg)
    }
    setMyCommands(commands){
        return this.request('setMyCommands', {commands})
    }
    registerWebhook(webhookUrl) {
        return fetch(
            this.apiUrl('setWebhook', {
                url: webhookUrl,
                secret_token: this.botSecret
            })
        ).then(r => r.json())
    }
    unRegisterWebhook() {
        return this.registerWebhook('')
    }
}

/**
 * Handle incoming Update
 * https://core.telegram.org/bots/api#update
 */
async function onUpdate(bot, update) {
    if ('message' in update) {
        await onMessage(bot, update.message)
    }
}

/**
 * Handle incoming Message
 * https://core.telegram.org/bots/api#message
 */
async function onMessage(bot, message) {
    const helpMessage = `
/list 显示所有agent节点序号和名称
/statusAll 显示所有agent节点是否在线
/status [节点序号/节点名/节点uuid] 显示agent节点的当前详细状态
`.trim()
    try {
        if (message.text === '/start' || message.text === '/help') {
            await bot.setMyCommands(commands)
            return bot.sendMessage({
                chat_id: message.chat.id,
                text: "Hello, I'm NodeGet bot\n\n" + helpMessage,
            })
        }
        if ('all' === bot.metaInfo.adminUid.toString() ||
            message.chat.id.toString() === bot.metaInfo.adminUid.toString()) {
            if (/^\/echo /.exec(message.text)) {
                return bot.sendMessage({
                    chat_id: message.chat.id,
                    text: message.text.slice(6).trim()
                })
            }
            if (/^\/list/.exec(message.text)) {
                await bot.sendMessage({
                    chat_id: message.chat.id,
                    text: '⏳ 获取服务器列表，请稍等...',
                })
                return bot.sendMessage({
                    chat_id: message.chat.id,
                    ...await listServers(bot.metaInfo.token)
                })
            }
            if (/^\/statusAll/.exec(message.text)) {
                await bot.sendMessage({
                    chat_id: message.chat.id,
                    text: '⏳ 检查服务器状态，请稍等...',
                })
                return bot.sendMessage({
                    chat_id: message.chat.id,
                    ...await checkAllServerStatus(bot.metaInfo.token)
                })
            }
            if (/^\/status \S+$/.exec(message.text)) {
                await bot.sendMessage({
                    chat_id: message.chat.id,
                    text: '⏳ 检查服务器状态，请稍等...',
                })

                const server = /^\/status (\S+)$/.exec(message.text)[1]
                return bot.sendMessage({
                    chat_id: message.chat.id,
                    ...await checkServerStatus(bot.metaInfo.token, server)
                })
            }
            if (/^\/vnstat (\S+)( (\S+))?$/.exec(message.text)) {
                await bot.sendMessage({
                    chat_id: message.chat.id,
                    text: '⏳ 生成流量统计报告，请稍等...',
                })

                const match = /^\/vnstat (\S+)( (\S+))?$/.exec(message.text)
                const server = match[1]
                const allowed = new Set(['minute', 'hour', 'day', 'month', 'year'])
                const unit = allowed.has(match[3]) ? match[3] : 'minute'
                
                const {lastReport} = await bot.metaInfo.ctx.inlineCall('vnstat-worker', {
                  'unit':unit,
                  agentUuid: await getServerUUID(bot.metaInfo.token, server)
                }, 5000)
                return bot.sendMessage({
                    chat_id: message.chat.id,
                    text:lastReport.slice(0, 2000)
                })
            }
        }
    } catch (error) {
        return bot.sendMessage({
            chat_id: message.chat.id,
            text: '🚨 发生错误！\n' + error.toString() + '\n' + error.stack,
        })
    }
}


function getAllAgentUuid(token) {
    return nodeget({
        jsonrpc: "2.0",
        method: "nodeget-server_list_all_agent_uuid",
        params: { token },
        id: randomUUID()
    })
        .then(r => r.result.uuids)
}

const getShortUUid = id => id.replace(/-/g, '').slice(0, 10)

/*
default: uuid => name
reverse: name => uuid
*/
function getAgentNameMap(token, agentUuids, reverse = false) {
    return nodeget({
        jsonrpc: "2.0",
        method: "kv_get_multi_value",
        params: {
            token,
            namespace_key: agentUuids.map(v => ({
                key: "metadata_name",
                namespace: v
            }))
        },
        id: randomUUID()
    })
        .then(r => r.result)
        .then(r => new Map(
            r.filter(v => v.key === "metadata_name")
                .map(v => [v.namespace, v.value || getShortUUid(v.namespace)])
                .map(v => reverse ? [v[1], v[0]] : v)
        ))
}

function getDynamicMultiLast(token, agentUuids) {
    return nodeget({
        jsonrpc: "2.0",
        method: "agent_dynamic_data_multi_last_query",
        params: {
            token,
            uuids: agentUuids,
            fields: ["cpu"]
        },
        id: randomUUID()
    })
        .then(r => r.result)
}

function getDynamicLast(token, agentUUID) {
    return nodeget({
        jsonrpc: "2.0",
        method: "agent_query_dynamic",
        params: {
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
        id: randomUUID()
    })
        .then(r => r.result)
}
function getStaticLast(token, agentUUID) {
    return nodeget({
        jsonrpc: "2.0",
        method: "agent_query_static",
        params: {
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
        id: randomUUID()
    })
        .then(r => r.result)
}

async function listServers(token) {
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

async function getServerUUID(token, server) {
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

async function checkServerStatus(token, server) {
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

async function checkAllServerStatus(token) {
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


export default {
    async onCall(params, env, ctx) {
        try {
            notExitedfunc()
        } catch (error) {
            return {error: error.toString() + '\n' + error.stack}
        }
    },
    async onInlineCall(params, env, ctx) {
        const allowedCallers = new Set(JSON.parse(env.allowdCallers))
        if (!allowedCallers.has(ctx.inlineCaller)) {
            return {
                ok: false,
                error: 'not allowed caller'
            }
        }
        return { ok: true, from: "onInlineCall", params, env, ctx };
    },
    async onRoute(request, env, ctx) {
        const token = env.token
        const botToken = env.botToken
        const botSecret = env.botSecret
        const adminUid = env.adminUid

        const webhookPath = '/endpoint'
        const url = new URL(request.url)
        const pathname = url.pathname
        const routeRe = /^\/worker-route\/([-_.0-9a-zA-Z]+)(\/.*)$/
        const match = routeRe.exec(pathname)
        if (!match) {
            return new Response('404 not match', { status: 404 })
        }
        const [_, routeName, subPathname] = match

        const bot = new Telegram(botToken, botSecret, { adminUid, token, ctx})

        switch (subPathname) {

            case '/registerWebhook':
                {
                    let webhookUrl = `${url.protocol}//${url.hostname}/worker-route/${routeName}${webhookPath}`
                    let r = await bot.registerWebhook(webhookUrl)
                    await bot.setMyCommands(commands)
                    return 'ok' in r && r.ok ? new Response('Ok') : Response.json(r)
                }

            case '/unRegisterWebhook':
                {
                    let r = await bot.unRegisterWebhook()
                    return 'ok' in r && r.ok ? new Response('Ok') : Response.json(r)
                }


            case webhookPath:
                {
                    const update = await request.json()
                    const inputSecret = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
                    if(inputSecret === botSecret){
                        await onUpdate(bot, update)
                        return new Response('ok')
                    }
                    return new Response('bad secret', {status:403})
                }

            default:
                return new Response('404', { status: 404 })
        }
    }
};

function formatBytes(b) {
    const units = ["B","KB","MB","GB","TB"]
    let i = 0
    while (b >= 1024 && i < units.length-1) {
        b /= 1024
        i++
    }
    return b.toFixed(1) + " " + units[i]
}

function formatUptime(sec) {
    const d = Math.floor(sec/86400)
    const h = Math.floor((sec%86400)/3600)
    return `${d}d ${h}h`
}