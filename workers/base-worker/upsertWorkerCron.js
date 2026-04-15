export async function upsertWorkerCron(token, workerName, cronExpression) {
    const cronName = workerName + '-cron'
    const oldCrons = await nodeget("crontab_get", {
        token,
    }).then(r => r.result.filter(v => v.name === cronName))

    const method = oldCrons.length ? 'crontab_edit' : 'crontab_create'
    return nodeget(method, {
        token,
        name: cronName,
        cron_expression:cronExpression,
        cron_type: {
            "server": {
                "js_worker": [
                    workerName,
                    {
                        task: "update"
                    }
                ]
            }
        }
    })
}