export async function handleCleanUpDatabase(token) {
    const logs = [];

    const agentUUIDs = (await nodeget("nodeget-server_list_all_agent_uuid", { token }))
        .result.uuids;

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
            const duration = dbLimits
                .filter(v => v.key === key)
                .sort((b, a) => a.key.length - b.key.length)[0];

            if (duration) {
                const params = { ...paramsBase };
                params.conditions[1].timestamp_to = Date.now() - duration.value;
                const result = await nodeget(action, params);
                logs.push({ [action]: result, agentUUID, params });
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
        const duration = globalDbLimits
            .filter(v => v.key === key)
            .sort((b, a) => a.key.length - b.key.length)[0];

        if (duration) {
            try {
                const result = await nodeget(action, {
                    token,
                    query: { condition: [{ [timeKey]: Date.now() - duration.value }] }
                });
                logs.push({ ["delete_" + action]: result });
            } catch (e) { }
        }
    }

    return { ok: true, logs };
}