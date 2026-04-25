import { upsertWorker } from './upsertWorker'
import { getResources } from './getResources'
import { upsertCrons } from '../../lib/crons'

export default {
    async onCall(params, env, ctx) {
        try {
            if (params.lifecycle) {
                return {
                    lifecycle: params.lifecycle,
                    result: await this.lifecycle(params, env, ctx)
                }
            }
        } catch (error) {
            return { error: error.toString() + '\n' + error.stack }
        }

        return { ok: true, from: "onCall", params }
    },
    async onCron(params, env, ctx) {
        try {
            // self-update
            if (params.task === 'update') {
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
                return await Promise.all([
                    this.update(params, env, ctx),
                    this.addSnippets(params, env, ctx),
                    getResources(
                        ['/cron.json'], env.resource_url
                    )
                        .then(r => JSON.parse(r[0]))
                        .then(crons => upsertCrons(crons, env.token))
                ])
                break;

            case 'server-update':
                return await this.update(params, env, ctx)
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
            'static-worker',
            'server-task-worker'
        ]
        const errors = []
        for (let i = 0, len = essentialModules.length; i < len; i++) {
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
            base: await upsertWorker(env.token, ctx.workerName, env.resource_url),
            essentialModules: errors.length === 0 ? undefined : errors
        }
    },

    async addSnippets(params, env, ctx) {
        const snippets = await getResources(
            ['/snippets.json'], env.resource_url
        ).then(r => JSON.parse(r[0]))

        // 是否存在kv
        const namespaces = await nodeget('kv_list_all_namespace', {
            token: env.token
        }).then(r => r.result)
        const namespace = 'script_snippet'
        if (namespaces.indexOf(namespace) === -1) {
            await nodeget('kv_create', {
                token: env.token,
                namespace
            })
        }
        const scriptNames = await nodeget('kv_get_all_keys', {
            token: env.toString,
            namespace
        }).then(r => new Set(r.result))

        const notExisted = snippets.filter(s => !scriptNames.has(s.name))

        const now = Date.now()
        return Promise.all(
            notExisted.map((s, i) => {
                return nodeget({
                    "jsonrpc": "2.0",
                    "method": "kv_set_value",
                    "params": {
                        "token": env.token,
                        "namespace": namespace,
                        "key": s.name,
                        "value": {
                            "content": s.content,
                            "created_at": now,
                            "lang": "shell",
                            "name": s.name,
                            "order": now + i * 100,
                            "updated_at": now
                        }
                    },
                    "id": randomUUID()
                })
            })
        )
    }
}


