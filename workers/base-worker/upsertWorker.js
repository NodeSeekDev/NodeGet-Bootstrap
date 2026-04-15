import { unicodeToBase64 } from '../../lib/base64'
import { upsertWorkerCron } from './upsertWorkerCron'
import { getWorkerResources } from './getResources'

export async function upsertWorker(token, workerName, resource_url) {
    const oldWorker = await nodeget('js-worker_read', {
        token,
        name: workerName
    }).then(r => r.result)

    if(oldWorker && oldWorker.env?.disable_auto_update === "true"){
        return
    }

    const resources = await getWorkerResources(
        workerName,
        resource_url
    )

    const manifest = resources.manifest


    if(oldWorker && 
        oldWorker.env.version_hash && 
        oldWorker.env.version_hash === manifest.version_hash){
        // same version, no update return
        return
    }

    const routeName = !manifest.route_name ? undefined :
        (manifest.route_name === '$random' ? randomUUID() : manifest.route_name)

    const newWorker = {
        name: workerName,
        js_script_base64: unicodeToBase64(resources.code),
        description: resources.description,
        env: {
            ...manifest?.env,
            ...oldWorker?.env,
            version_hash: manifest.version_hash,
            token
        },
        route_name: routeName
    }

    let update
    if(oldWorker){
        update = await nodeget('js-worker_update', {
            ...oldWorker,
            ...newWorker,
            create_at: undefined,
            update_at: undefined,
            token,
        })
    }else{
        update = await nodeget('js-worker_create', {
            "runtime_clean_time": 120000, 
            ...newWorker,
            token,
        })
    }

    // crontab
    let cron
    if (manifest.cron) {
        cron = await upsertWorkerCron(token, workerName, manifest.cron)
    }

    return {
        update, cron
    }
}