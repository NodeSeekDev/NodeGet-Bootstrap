// 保留时长必须是大于 0 的有限数字（毫秒），数字字符串也接受；其余一律视为没设置
function parseLimit(value) {
    const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

// 节点自己的设置优先，没设置或不合法才用全局值
function pickLimit(limits, namespace, key) {
    const own = parseLimit(limits.find(v => v.namespace === namespace && v.key === key)?.value);
    if (own !== undefined) return own;
    return parseLimit(limits.find(v => v.namespace === 'global' && v.key === key)?.value);
}

export async function handleCleanUpDatabase(token) {
    const logs = [];

    let agentUUIDs, deletedUUIDS = new Set()
    try {
        const agentsWithMode = (await nodeget("agent-uuid_list_all_with_agent_mode", { token })).result
        agentUUIDs = agentsWithMode.map(v => v.uuid)
        deletedUUIDS = new Set(agentsWithMode.filter(v => v.soft_delete === true).map(v => v.uuid))
    } catch (error) {
        agentUUIDs = await nodeget("nodeget-server_list_all_agent_uuid", {
            token
        }).then((r) => r.result.uuids);
    }

    // agent 清理任务映射
    const agentTasks = {
        database_limit_task: "task_delete",
        database_limit_dynamic_monitoring_summary: "agent_delete_dynamic_summary",
        database_limit_dynamic_monitoring: "agent_delete_dynamic"
    };

    // 遍历 agent 清理
    for (const agentUUID of agentUUIDs) {
        const paramsBase = {
            token,
            conditions: [
                { uuid: agentUUID },
                { timestamp_to: '' }
            ],
        };

        const dbLimits = (await nodeget("kv_get_multi_value", {
            token,
            namespace_key: [
                { namespace: 'global', key: "database_limit_*" },
                { namespace: agentUUID, key: "database_limit_*" }
            ]
        })).result;

        for (const key in agentTasks) {
            const action = agentTasks[key];
            const duration = deletedUUIDS.has(agentUUID) ?
                0 : pickLimit(dbLimits, agentUUID, key);

            if (duration) {
                const params = { ...paramsBase };
                params.conditions[1].timestamp_to = Date.now() - duration;
                const cleanIt = async () => {
                    const result = await nodeget(action, params);
                    logs.push({ [action]: result, agentUUID, params });
                }
                if(deletedUUIDS.has(agentUUID)){
                    setTimeout(cleanIt, 20 * 1000) // 20秒后清理，避免卡顿
                }else{
                    await cleanIt()
                }
            }
        }
    }

    // 全局清理任务映射
    const globalTasks = {
        database_limit_crontab_result: { action: "crontab-result_delete", timeKey: "run_time_to" },
        database_limit_js_result: { action: "js-result_delete", timeKey: "start_time_to" }
    };

    const globalDbLimits = (await nodeget("kv_get_multi_value", {
        token,
        namespace_key: [{ namespace: 'global', key: "database_limit_*" }]
    })).result;

    for (const key in globalTasks) {
        const { action, timeKey } = globalTasks[key];
        const duration = parseLimit(globalDbLimits.find(v => v.key === key)?.value);

        if (duration) {
            try {
                const result = await nodeget(action, {
                    token,
                    query: { condition: [{ [timeKey]: Date.now() - duration }] }
                });
                logs.push({ ["delete_" + action]: result });
            } catch (e) { }
        }
    }

    return { ok: true, logs };
}