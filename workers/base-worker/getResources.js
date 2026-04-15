const defaultResourceUrl = 'https://bootstrap.nodeget.com/workers'

export async function getResources(resourceUrl = defaultResourceUrl, workerName) {
    const resources = await Promise.all(
        ['index.js', 'manifest.json', 'readme.md']
            .map(f => fetch(`${resourceUrl}/${workerName}/${f}`).then(r => r.text()))
    )
    return {
        code: resources[0],
        manifest: JSON.parse(resources[1]),
        description: resources[2] || undefined,
    }
}