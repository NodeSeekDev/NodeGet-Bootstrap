import { 
    listServers, 
    checkAllServerStatus, 
    checkServerStatus,
    getServerUUID,
    checkStatusChange
} from '../operate'

const helpMessage = `
/list 显示所有agent节点序号和名称
/statusAll 显示所有agent节点是否在线
/status [节点序号/节点名/节点uuid] 显示agent节点的当前详细状态
/statusChange 显示在线信息有变动的节点
`.trim()

import { offlineTimeout, commands } from '../config'

/**
 * Handle incoming Message
 * https://core.telegram.org/bots/api#message
 */
export async function onMessage(bot, message) {
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
            if (/^\/statusChange/.exec(message.text)) {
                await bot.sendMessage({
                    chat_id: message.chat.id,
                    text: '⏳ 检查服务器状态变动，请稍等...',
                })
                return bot.sendMessage({
                    chat_id: message.chat.id,
                    ...await checkStatusChange(bot.metaInfo.token)
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
