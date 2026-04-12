export default {
    async onCall(params, env, ctx) {
    },
    async onCron(params, env, ctx) {
        // self-update
        // todo: version control.
        const defaultResourceUrl = 'https://bootstrap.nodeget.com/workers/base-worker/index.js'
        const resourceUrl = env.resourceUrl || defaultResourceUrl
        const baseWorkerContent = await fetch(`${resourceUrl}/base-worker.js`).then(r => r.text())
        await this.updateWorker({
            name:ctx.workerName || 'nodeget-base-worker.js',
            content:baseWorkerContent
        })
    },
    async updateWorker(worker = {}) {
        const workerName = worker.name
        const content = worker.content

        if(!workerName){
            throw 'worker name not found'
        }
        if(!content){
            throw 'content not found'
        }

        try {
            const oldWorker = await nodeget('js-worker_read', {
                token:env.token,
                name:workerName
            }).then(r => r.result)

            if(!oldWorker){
                throw 'worker not found'
            }
          
            const update = await nodeget('js-worker_update', {
                ...oldWorker,
                token:env.token,
                "js_script_base64": btoa(content),
                "create_at": undefined,
                "update_at": undefined,
            })
            return update
        } catch (error) {
            return {error: error.toString() + '\n' + error.stack}
        }
    },
}