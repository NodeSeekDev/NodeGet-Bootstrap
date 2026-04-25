export async function handleCleanUpDatabase(token) {
    const agentUUIDs = await nodeget("nodeget-server_list_all_agent_uuid", {
        token,
    }).then(r => r.result.uuids)

    const logs = []

    for(let i = 0, len = agentUUIDs.length; i < len ; i ++){
        const agentUUID = agentUUIDs[i]
        const params = {
            token,
            conditions: [
                { 
                    uuid: agentUUID,
                },
                { 
                    timestamp_to:''
                }
            ],
        };

        const dbLimits = await nodeget("kv_get_multi_value", {
            token,
            "namespace_key": [
                {
                    "namespace": agentUUID,
                    "key": "database_limit_*" 
                }
            ]
        }).then(r => r.result)

        if(Array.isArray(dbLimits)){
            let duration = dbLimits.find(v => v.key === 'database_limit_task')
            if(duration){
                params.conditions[1].timestamp_to = Date.now() - duration.value
                const result = await nodeget("task_delete", params);
                logs.push({
                    "task_delete": result,
                    agentUUID, params
                })
            }
            
            duration = dbLimits.find(v => v.key === 'database_limit_dynamic_monitoring_summary')
            if(duration){
                params.conditions[1].timestamp_to = Date.now() - duration.value
                const result = await nodeget("agent_delete_dynamic_summary", params);
                logs.push({
                    "agent_delete_dynamic_summary": result,
                    agentUUID,
                })
            }

            duration = dbLimits.find(v => v.key === 'database_limit_dynamic_monitoring')
            if(duration){
                params.conditions[1].timestamp_to = Date.now() - duration.value
                const result = await nodeget("agent_delete_dynamic", params);
                logs.push({
                    "agent_delete_dynamic": result,
                    agentUUID, params
                })
            }

            duration = dbLimits.find(v => v.key === 'database_limit_static_monitoring')
            if(duration){
                params.conditions[1].timestamp_to = Date.now() - duration.value
                const result = await nodeget("agent_delete_static", params);
                logs.push({
                    "agent_delete_static": result,
                    agentUUID, params
                })
            }
        }
    }

    return {
        ok: true,
        logs
    };
}
