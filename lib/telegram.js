export class Telegram {
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