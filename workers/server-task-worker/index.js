import {handleRequest} from './handleRequest'
import {handleCleanUpDatabase} from './handleCleanUpDatabase'

export default {
  async onCall(params, env, ctx) {
    const task = params.task || {}
    const taskName = task.name
    const token = task.token // must be superToken

    switch (taskName) {
        case "http_request":
            // like agent http_request
            const httpRequest = task.data
            return handleRequest(httpRequest)

        case "ip":
            // like agent http_request
            return fetch("https://ip.nodeget.com/json")
              .then(r => r.json())
              .then(r => r.ip)

        case "clean_up_database":
            // like agent http_request
            return handleCleanUpDatabase(env.token)
    
        default:
            return {
                error:`task "${taskName}" is not found`
            }
    }
    return { ok: true, from: "onCall", params, env };
  },

  async onInlineCall(params, env, ctx) {
    return { ok: true, from: "onInlineCall", params, env };
  },

  async onCron(params, env, ctx) {
    return { ok: true, from: "onCron", params, env };
  },

  async onRoute(request, env, ctx) {
    return new Response("ok", { status: 200 });
  }
};