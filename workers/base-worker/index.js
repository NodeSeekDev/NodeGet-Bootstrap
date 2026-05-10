import { upsertWorker } from './upsertWorker'
import { getResources } from './getResources'
import { addCronsIfNotExist } from '../../lib/crons'
import { db_limit_config } from './config'

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
            if (params.task === 'update') {
                return {
                    task: {
                        ...await this.update(params, env, ctx),
                        ...await this.updateSelf(params, env, ctx)
                    }
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

        const init = async() => {
            await Promise.all([
                this.initGlobal(params, env, ctx),
                this.update(params, env, ctx),
                this.addSnippets(params, env, ctx),
                getResources(
                        ['/cron.json'], env.resource_url
                    )
                        .then(r => JSON.parse(r[0]))
                        .then(crons => addCronsIfNotExist(crons, env.token))
            ])
            await this.setInitedFlag(params, env, ctx)
            await this.updateSelf(params, env, ctx)
        }

        switch (hook) {
            case 'server-create':
                if(!this.getInitedFlag(params, env, ctx)){
                    return {"msg":"already inited"}
                }
                return init()

            case 'server-reset':
                return init()
                break;

            case 'server-update':
                if(!this.getInitedFlag(params, env, ctx)){
                    return init()
                }

                return {
                    ...await this.update(params, env, ctx),
                    ...await this.updateSelf(params, env, ctx),
                }
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
            'server-task-worker',
            'ip-location-update',
            'static-worker',
            'tg-bot-worker',
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
            essentialModules: errors.length === 0 ? undefined : errors
        }
    },
    async updateSelf(params, env, ctx) {
        return {
            base: await upsertWorker(env.token, ctx.workerName, env.resource_url),
        }
    },


    async initGlobal(params, env, ctx) {
        // 是否存在kv
        const namespaces = await nodeget('kv_list_all_namespace', {
            token: env.token
        }).then(r => r.result)

        const namespace = 'global'
        if (namespaces.indexOf(namespace) === -1) {
            await nodeget('kv_create', {
                token: env.token,
                namespace
            })
        }

        const allLimits = Array.from(Object.keys(db_limit_config))

        const limitsExisted = await nodeget('kv_get_all_keys', {
            token: env.token,
            namespace
        }).then(r => new Set(r.result))
        const notExisted = allLimits.filter(limit => !limitsExisted.has(limit))

        return Promise.all(
            notExisted.map(limit => {
                return nodeget({
                    "jsonrpc": "2.0",
                    "method": "kv_set_value",
                    "params": {
                        "token": env.token,
                        "namespace": namespace,
                        "key": limit,
                        "value": db_limit_config[limit]
                    },
                    "id": randomUUID()
                })
            })
        )
    },

    async setInitedFlag(params, env, ctx) {
        const namespace = 'global'

        return nodeget(
            "kv_set_value",
            {
                "token": env.token,
                "namespace": namespace,
                "key": 'inited',
                "value": true
            },
        )
    },
    async getInitedFlag(params, env, ctx) {
        // 是否存在kv
        const namespaces = await nodeget('kv_get_value', {
            token: env.token
        }).then(r => r.result)

        const namespace = 'global'
        if (namespaces.indexOf(namespace) === -1) {
            return false
        }

        return nodeget(
            "kv_get_value",
            {
                "token": env.token,
                "namespace": namespace,
                "key": 'inited'
            },
        ).then(r => r.result)
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
            token: env.token,
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


