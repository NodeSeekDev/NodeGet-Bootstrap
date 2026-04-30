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
                    "namespace": 'global',
                    "key": "database_limit_*" 
                },
                {
                    "namespace": agentUUID,
                    "key": "database_limit_*" 
                }
            ]
        })
            .then(r => r.result)

        if(Array.isArray(dbLimits)){
            let duration = dbLimits.filter(v => v.key === 'database_limit_task')
            if(duration.length){
                duration = duration.sort((b, a) => a.key.length - b.key.length)[0]
                params.conditions[1].timestamp_to = Date.now() - duration.value
                const result = await nodeget("task_delete", params);
                logs.push({
                    "task_delete": result,
                    agentUUID, params
                })
            }
            
            duration = dbLimits.filter(v => v.key === 'database_limit_dynamic_monitoring_summary')
            if(duration.length){
                duration = duration.sort((b, a) => a.key.length - b.key.length)[0]
                params.conditions[1].timestamp_to = Date.now() - duration.value
                const result = await nodeget("agent_delete_dynamic_summary", params);
                logs.push({
                    "agent_delete_dynamic_summary": result,
                    agentUUID,
                })
            }

            duration = dbLimits.filter(v => v.key === 'database_limit_dynamic_monitoring')
            if(duration.length){
                duration = duration.sort((b, a) => a.key.length - b.key.length)[0]
                params.conditions[1].timestamp_to = Date.now() - duration.value
                const result = await nodeget("agent_delete_dynamic", params);
                logs.push({
                    "agent_delete_dynamic": result,
                    agentUUID, params
                })
            }

        }
    }

    const dbLimits = await nodeget("kv_get_multi_value", {
        token,
        "namespace_key": [
            {
                "namespace": 'global',
                "key": "database_limit_*" 
            },
        ]
    })
        .then(r => r.result)


    let duration = dbLimits.filter(v => v.key === 'database_limit_crontab_result')
    if(duration.length){
        duration = duration.sort((b, a) => a.key.length - b.key.length)[0]

        try {
            const result = await nodeget("crontab-result_delete", {
                token,
                "query":{
                    "condition":[
                        {
                            "run_time_to": Date.now() - duration.value
                        }
                    ]
                }
            });
            logs.push({
                "delete_crontab_result": result,
            })
        } catch (error) {
        }
    }


    duration = dbLimits.filter(v => v.key === 'database_limit_js_result')
    if(duration.length){
        duration = duration.sort((b, a) => a.key.length - b.key.length)[0]
        const result = await nodeget("js-result_delete", {
            token,
            "query":{
                "condition":[
                    {
                        "start_time_to": Date.now() - duration.value
                    }
                ]
            }
        });
        logs.push({
            "delete_js_result": result,
        })
    }

    return {
        ok: true,
        logs
    };
}
