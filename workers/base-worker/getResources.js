const defaultResourceUrl = 'https://bootstrap.nodeget.com'

export async function getWorkerResources(workerName, resource_url = defaultResourceUrl) {
    const resources = await getResources(
        ['index.js', 'manifest.json', 'readme.md']
            .map(f => `/workers/${workerName}/${f}`),
        resource_url
    )
    return {
        code: resources[0],
        manifest: JSON.parse(resources[1]),
        description: resources[2] || undefined,
    }
}

export async function getResources(files = [], resource_url = defaultResourceUrl) {
    return Promise.all(
        files.map(f => fetch(`${resource_url}${f}`).then(r => r.text()))
    )
}