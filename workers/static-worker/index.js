import { base64ToBytes, bytesToBase64 } from '../../lib/base64'
import { getMimeType } from '../../lib/mime'

const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST',
    'access-control-expose-headers': '*',
    'access-control-allow-headers': '*'
}


export default {
    async onCall(params, env, ctx) {
        return { ok: true, from: "onCall", params, env, ctx };
    },
    async onInlineCall(params, env, ctx) {
        const allowedCallers = new Set(
            env.allowd_callers && JSON.parse(env.allowd_callers) || []
        )
        if (!allowedCallers.has(ctx.inlineCaller)) {
            return {
                ok: false,
                error: 'not allowed caller'
            }
        }
        return { ok: true, from: "onInlineCall", params, env, ctx };
    },
    async onRoute(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            // preflight
            return new Response(null, {
                headers: {
                    ...corsHeaders
                }
            })
        }

        const url = new URL(request.url)
        const pathname = url.pathname
        const routeRe = /^\/worker-route\/([-_.0-9a-zA-Z]+)\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\/(.*)$/
        const match = routeRe.exec(pathname)
        const token = (request.headers.get('authorization') || '')
            .replace(/^bearer +/i, '')


        if (!match) {
            return new Response('404', { status: 404, headers: corsHeaders })
        }

        const [_, __, resourceId, resourcePath] = match

        const namespace = `[static]:${resourceId}`

        if (request.method === 'GET') {
            // 获取不需要token

            const data = await nodeget({
                "jsonrpc": "2.0",
                "method": 'kv_get_value',
                "params": {
                    token:env.token,
                    namespace,
                    key: resourcePath
                },
                "id": randomUUID()
            })
                .then(r => r.result)
                .then(r => base64ToBytes(r))
            // todo: content-type according to file ext
            return new Response(data.buffer, {
                headers: {
                    ...corsHeaders,
                    'content-type':getMimeType(resourcePath)
                }
            })
        }

        if (request.method === 'POST') {
            // 储存需要token
            if (!token) {
                return new Response('403', { status: 403, headers: corsHeaders })
            }

            const buffer = await request.arrayBuffer()
            const bytes = new Uint8Array(buffer)
            const base64 = bytesToBase64(bytes)

            const namespaces = await nodeget({
                "jsonrpc": "2.0",
                "method": 'kv_list_all_namespace',
                "params": {
                    token,
                },
                "id": randomUUID()
            })
                .then(r => r.result)
                .then(r => new Set(r))


            if (!namespaces.has(namespace)) {
                await nodeget({
                    "jsonrpc": "2.0",
                    "method": 'kv_create',
                    "params": {
                        token,
                        namespace
                    },
                    "id": randomUUID()
                })
            }

            const result = await nodeget({
                "jsonrpc": "2.0",
                "method": 'kv_set_value',
                "params": {
                    token,
                    namespace,
                    key: resourcePath,
                    value: base64
                },
                "id": randomUUID()
            }).then(r => r.result)

            // todo: max content-length
            return new Response(
                JSON.stringify({
                    ok: true,
                    result,
                }),
                {
                    headers: {
                        ...corsHeaders
                    }
                }
            )
        }

        return new Response('404', { status: 404, headers: corsHeaders })
    }
};