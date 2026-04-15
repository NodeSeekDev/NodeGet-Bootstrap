import { upsertWorker } from './upsertWorker'

export default {
    async onCall(params, env, ctx) {
        if (params.lifecycle) {
            await this.lifecycle(params, env, ctx)
        }

        return { ok: true, from: "onCall", params }
    },
    async onCron(params, env, ctx) {
        try {
            // self-update
            if(params.task === 'update'){
                return {
                    task: await this.update(params, env, ctx)
                }
            }
            return {
                ok: true
            }
        } catch (error) {
            return { error: error.toString() + '\n' + error.stack }
        }
    },
    async lifecycle(params, env, ctx) {
        const hook = params.lifecycle
        switch (hook) {
            case 'server-create':
                await this.update(params, env, ctx)
                break;

            case 'server-update':
                await this.update(params, env, ctx)
                break;

            case 'server-destroy':
                break;

            case 'agent-create':
                break;

            case 'agent-update':
                break;

            case 'agent-destroy':
                break;

            default:
                break;
        }
    },

    async update(params, env, ctx) {
        const essentialModules = [
            'static-worker2'
        ]
        const errors = []
        for(let i = 0, len = essentialModules.length; i < len; i++){
            const worker = essentialModules[i]
            try {
                await upsertWorker(env.token, worker, env.resource_url)
            } catch (error) {
                errors.push({
                    worker,
                    updateError: error.toString() + '\n' + error.stack
                })
            }
        }
        return {
            base:await upsertWorker(env.token, ctx.workerName, env.resource_url),
            essentialModules:errors.length === 0 ? undefined : errors
        }
    }
}


