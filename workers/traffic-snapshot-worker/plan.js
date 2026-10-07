// 流量快照的纯函数：不访问网络，不读全局变量，方便单独测试。
// index.js 负责取数据和调接口，这里只负责判断。

export const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

// 快照间隔默认 15 分钟
export const DEFAULT_INTERVAL_MS = 15 * MINUTE_MS
// 快照保留时长默认 365 天
export const DEFAULT_RETENTION_MS = 365 * DAY_MS
// 保留时长的下限。防止把"天数"误填成毫秒（比如 365）导致把所有快照都清掉
export const MIN_RETENTION_MS = HOUR_MS

/**
 * 解析 Kv 里的快照间隔。
 *
 * @param value Kv 里读到的值，没配置时为 null / undefined
 * @returns {{value: number, warning: string|null}} 间隔（毫秒）；没配置时用默认值且没有 warning，
 *   配置不合法时用默认值并带上原因
 */
export function parseInterval(value) {
    if (value === null || value === undefined) {
        return {value: DEFAULT_INTERVAL_MS, warning: null}
    }
    if (!Number.isInteger(value) || value < MINUTE_MS || value % MINUTE_MS !== 0) {
        return {
            value: DEFAULT_INTERVAL_MS,
            warning: `traffic_snapshot_interval 必须是 60000 的整数倍（毫秒，至少 1 分钟），当前是 ${JSON.stringify(value)}，已改用默认的 15 分钟`,
        }
    }
    return {value, warning: null}
}

/**
 * 解析 Kv 里的快照保留时长。
 *
 * @param value Kv 里读到的值，没配置时为 null / undefined
 * @returns {{value: number, warning: string|null}} 保留时长（毫秒）；规则同 parseInterval
 */
export function parseRetention(value) {
    if (value === null || value === undefined) {
        return {value: DEFAULT_RETENTION_MS, warning: null}
    }
    if (!Number.isInteger(value) || value < MIN_RETENTION_MS) {
        return {
            value: DEFAULT_RETENTION_MS,
            warning: `database_limit_traffic_snapshot 必须是毫秒数且至少 1 小时，当前是 ${JSON.stringify(value)}，已改用默认的 365 天`,
        }
    }
    return {value, warning: null}
}

/** 时间所在的"快照时间段"编号，同一个编号内最多存一条快照 */
export function bucketOf(timeMs, intervalMs) {
    return Math.floor(timeMs / intervalMs)
}

/**
 * 本次快照的时间：现在向下取整到分钟。
 *
 * 不标成时间段的整点：Worker 刚装好或者晚了几分钟才执行时，标整点会假装那个时刻就有数据，
 * 查询时悄悄少算流量；标真实时间则会如实报"找不到起点"。
 * 正常情况下每分钟第 0 秒执行，和整点只差几秒。
 */
export function snapshotTimeOf(nowMs) {
    return nowMs - (nowMs % MINUTE_MS)
}

/**
 * 决定哪些网卡该写快照。
 *
 * 对每块网卡依次判断：
 * 1. 还没有快照：写
 * 2. 最后一条快照已经在当前时间段（或更晚）：不写，每个时间段只存一条
 * 3. 上次存快照之后没有收到过这块网卡的新上报（updated_at <= last_snapshot_time）：不写，
 *    总流量没变，写出来的快照和上一条一样。设备离线或网卡消失后不会一直重复写
 * 4. 其余：写
 *
 * @param devices agent_query_traffic_current 的返回值
 * @param nowMs 现在（毫秒）
 * @param intervalMs 快照间隔（毫秒）
 * @returns {{writes: Array, stats: object}} writes 是要写入的快照，stats 是各种情况的网卡数
 */
export function planSnapshots(devices, nowMs, intervalMs) {
    const time = snapshotTimeOf(nowMs)
    const currentBucket = bucketOf(nowMs, intervalMs)
    const writes = []
    const stats = {interfaces: 0, written: 0, skipped_same_period: 0, skipped_unchanged: 0}

    for (const device of devices) {
        for (const item of device.interfaces) {
            stats.interfaces += 1
            const last = item.last_snapshot_time
            if (last !== null && last !== undefined) {
                if (bucketOf(last, intervalMs) >= currentBucket) {
                    stats.skipped_same_period += 1
                    continue
                }
                if (item.updated_at <= last) {
                    stats.skipped_unchanged += 1
                    continue
                }
            }
            writes.push({
                uuid: device.uuid,
                interface_name: item.interface_name,
                snapshot_time: time,
                total_received: item.total_received,
                total_transmitted: item.total_transmitted,
            })
            stats.written += 1
        }
    }
    return {writes, stats}
}

/** 把数组按固定大小切成多段 */
export function chunk(items, size) {
    const chunks = []
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size))
    }
    return chunks
}
