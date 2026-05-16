const maxWait = 5000 // 5 seconds
export async function updateIPLocation(token, agentUUIDs = []) {
    const results = []
    for (let i = 0, len = agentUUIDs.length; i < len; i++) {
        const uuid = agentUUIDs[i]
        let ipResultDual = await Promise.all(
            [4, 6].map(v => {
                return nodeget('task_create_task_blocking', {
                    token,
                    target_uuid: uuid,
                    timeout_ms: maxWait,
                    task_type: {
                        "http_request": {
                            "url": "https://ip.nodeget.com/json?filter=ip",
                            "method": "GET",
                            "headers": {
                                "content-type": "application/json"
                            },
                            "body": "",
                            "ip": `ipv${v} auto`
                        }
                    }
                }).then((r) => r?.result?.task_event_result?.http_request?.body)
                  .catch(r => null)
            })
        )
        let ipResult = ipResultDual[0] || ipResultDual[1]

        if (ipResult) {
            ipResult = JSON.parse(ipResult)
            results.push(ipResult)
            const namespace = uuid
            const namespaces = await nodeget('kv_list_all_namespace', {
                token: token
            }).then(r => r.result)
            if (namespaces.indexOf(namespace) === -1) {
                await nodeget('kv_create', {
                    token: token,
                    namespace
                })
            }
            if(ipResult?.location?.geographicCoordinate?.longitude && ipResult?.location?.geographicCoordinate?.latitude){
                await nodeget('kv_set_value', {
                    token: token,
                    namespace,
                    "key": "metadata_longitude", 
                    "value": parseFloat(ipResult?.location?.geographicCoordinate?.longitude)
                })
                await nodeget('kv_set_value', {
                    token: token,
                    namespace,
                    "key": "metadata_latitude", 
                    "value": parseFloat(ipResult?.location?.geographicCoordinate?.latitude)
                })
            } 
            if(ipResult?.location?.country){
                await nodeget('kv_set_value', {
                    token: token,
                    namespace,
                    "key": "metadata_region", 
                    "value": ipResult?.location?.country
                })
            }
        }
    }
    return results
}