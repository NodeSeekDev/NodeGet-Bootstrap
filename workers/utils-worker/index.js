export default {
  async onCall(params, env, ctx) {
    const task = params.task || {}
    const taskName = task.name
    const token = task.token // must be superToken

    switch (taskName) {
        case "fetch":
            // like agent http_request
            const http_request = task.params
            break;
    
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