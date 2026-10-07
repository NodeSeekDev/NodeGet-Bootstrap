import {
    chunk,
    parseInterval,
    parseRetention,
    planSnapshots,
} from './plan'

const LOG = 'traffic-snapshot'
// 配置都放在 global 命名空间
const KV_NAMESPACE = 'global'
const KV_INTERVAL = 'traffic_snapshot_interval'
const KV_RETENTION = 'database_limit_traffic_snapshot'
// 每次调用 agent_write_traffic_snapshot 最多写多少条，服务端上限是 10000
const WRITE_BATCH_SIZE = 5000
// JSON-RPC 标准的"方法不存在"错误码
const METHOD_NOT_FOUND = -32601

export default {
    async onCall(params, env, ctx) {
        const task = (params && params.task) || {}

        switch (task.name) {
            case 'snapshot':
                return takeSnapshots(env.token)

            case 'cleanup':
                return cleanUpSnapshots(env.token)

            default:
                return {
                    error: `task "${task.name}" is not found`
                }
        }
    },

    async onCron(params, env, ctx) {
        if (params && params.task) {
            return this.onCall(params, env, ctx)
        }
        return {ok: true, from: 'onCron'}
    },
}

/**
 * 调用 NodeGet 接口，返回 result；接口返回 error 时抛出
 */
async function call(method, params) {
    const response = await nodeget(method, params)
    if (response.error) {
        const error = new Error(`${method}: ${response.error.message}`)
        error.rpcCode = response.error.code
        throw error
    }
    return response.result
}

/**
 * 读 Kv 里的配置，读不到（没配置、命名空间不存在）时返回 null
 */
async function readKv(token, key) {
    try {
        return await call('kv_get_value', {token, namespace: KV_NAMESPACE, key})
    } catch (e) {
        nodegetLog.warn(LOG, `读取 Kv ${KV_NAMESPACE}/${key} 失败，使用默认值：${e.message}`)
        return null
    }
}

/**
 * 判断每块网卡是否该存快照，该存的写入服务端。
 * 每分钟执行一次，是否真的写由快照间隔决定。
 */
async function takeSnapshots(token) {
    const now = Date.now()

    const interval = parseInterval(await readKv(token, KV_INTERVAL))
    if (interval.warning) {
        nodegetLog.warn(LOG, interval.warning)
    }

    let devices
    try {
        devices = await call('agent_query_traffic_current', {token})
    } catch (e) {
        if (e.rpcCode === METHOD_NOT_FOUND) {
            nodegetLog.warn(LOG, '服务端没有 agent_query_traffic_current 接口，请升级服务端，本次不存快照')
            return {ok: false, error: 'server_not_supported'}
        }
        nodegetLog.error(LOG, `读取当前总流量失败：${e.message}`)
        return {ok: false, error: e.message}
    }

    const {writes, stats} = planSnapshots(devices, now, interval.value)

    const result = {inserted: 0, ignored: 0, skipped: 0}
    try {
        for (const batch of chunk(writes, WRITE_BATCH_SIZE)) {
            const written = await call('agent_write_traffic_snapshot', {token, snapshots: batch})
            result.inserted += written.inserted
            result.ignored += written.ignored
            result.skipped += written.skipped
        }
    } catch (e) {
        // 已写入的不会回滚，没写的下一分钟重试（服务端写入幂等）
        nodegetLog.error(LOG, `写入快照失败，下一分钟重试：${e.message}`)
        return {ok: false, error: e.message, interval: interval.value, stats, ...result}
    }

    if (writes.length > 0) {
        nodegetLog.info(LOG, `写入快照 ${result.inserted} 条（忽略 ${result.ignored}，跳过 ${result.skipped}）`)
    }
    return {ok: true, interval: interval.value, stats, ...result}
}

/**
 * 删除超过保留时长的快照，以及整段早于该时间的"可能丢失数据"记录
 */
async function cleanUpSnapshots(token) {
    const retention = parseRetention(await readKv(token, KV_RETENTION))
    if (retention.warning) {
        nodegetLog.warn(LOG, retention.warning)
    }

    const endTime = Date.now() - retention.value
    try {
        const deleted = await call('agent_delete_traffic_snapshot', {token, end_time: endTime})
        if (deleted.deleted_snapshots > 0 || deleted.deleted_possible_data_losses > 0) {
            nodegetLog.info(
                LOG,
                `清理快照 ${deleted.deleted_snapshots} 条、可能丢失数据记录 ${deleted.deleted_possible_data_losses} 条`,
            )
        }
        return {ok: true, retention: retention.value, end_time: endTime, ...deleted}
    } catch (e) {
        if (e.rpcCode === METHOD_NOT_FOUND) {
            nodegetLog.warn(LOG, '服务端没有 agent_delete_traffic_snapshot 接口，请升级服务端，本次不清理')
            return {ok: false, error: 'server_not_supported'}
        }
        nodegetLog.error(LOG, `清理快照失败：${e.message}`)
        return {ok: false, error: e.message}
    }
}
