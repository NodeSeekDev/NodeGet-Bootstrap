export async function upsertCrons(crons, token) {
    // 是否存在kv
    const crontabs = await nodeget('crontab_get', {
        token: token
    })
        .then(r => (r.result || []).map(v => v.name))
        .then(r => new Set(r))

    const data = crons.map(cron => {
        const method = crontabs.has(cron.name) ? 'crontab_edit' : 'crontab_create'
        return {
            "jsonrpc": "2.0",
            "method": method,
            "params": {
                ...cron,
                token: token,
            },
            "id": randomUUID()
        }
    })
    const cronResult = await nodeget(data)
        .then(r => r.result)

    return cronResult
}