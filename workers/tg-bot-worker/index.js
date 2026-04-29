/*
telegram bot for NodeGet

*/
import { Telegram } from '../../lib/telegram'
import { formatBytes, formatUptime, escapeHTML } from '../../lib/format'
import { onUpdate } from './tg/onUpdate'
import { offlineTimeout, commands } from './config'
import { checkOnline } from './checkOnline'

function makeBot(env, ctx){
    const token = env.token
    const botToken = env.botToken
    const botSecret = env.botSecret
    const adminUid = env.adminUid
    const bot = new Telegram(botToken, botSecret, { adminUid, token, ctx})

    return bot
}

export default {
    async onCall(params, env, ctx) {
        try {
            const task = params.task || {}
            switch (task.name) {
                case 'send-message':
                    {
                        const msg = task.message || {}
                        const bot = makeBot(env, ctx)
                        await bot.sendMessage(msg)
                        break;
                    }
                default:
                    break;
            }

            return {params, env, ctx}
        } catch (error) {
            return {error: error.toString() + '\n' + error.stack}
        }
    },
    async onCron(params, env, ctx) {
        try {
            const task = params.task || {}
            switch (task.name) {
                case 'check-online':
                    {
                        const bot = makeBot(env, ctx)
                        await checkOnline(bot, token)
                        break;
                    }
            
                default:
                    break;
            }
            return {params, env, ctx}
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
        const botSecret = env.botSecret

        const webhookPath = '/endpoint'
        const url = new URL(request.url)
        const pathname = url.pathname
        const routeRe = /^\/worker-route\/([-_.0-9a-zA-Z]+)(\/.*)$/
        const match = routeRe.exec(pathname)
        if (!match) {
            return new Response('404 not match', { status: 404 })
        }
        const [_, routeName, subPathname] = match

        const bot = makeBot(env, ctx)

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