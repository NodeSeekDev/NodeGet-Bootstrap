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

    // self update
    async update(params, env, ctx) {
        const disableSelfUpdate = env["disable_self_update"] === "true"
        if (disableSelfUpdate) {
            return // disabled
        }

        return upsertWorker(env.token, ctx.workerName, env.resource_url)
    }
}


