import {updateIPLocation} from './updateIPLocation'

export default {
  async onCall(params, env, ctx) {
    try {
        let agentUUIDs = params.uuids
        if(!agentUUIDs){
            agentUUIDs = await nodeget("nodeget-server_list_all_agent_uuid", {
                token:env.token,
            }).then(r => r.result.uuids)
        }
        if(agentUUIDs.length > 0){
            return updateIPLocation(env.token, agentUUIDs)
        }
    } catch (error) {
        return { error: error.toString() + '\n' + error.stack }
    }

    return { ok: true, from: "onCall", params, env };
  },

  async onInlineCall(params, env, ctx) {
    return { ok: true, from: "onInlineCall", params, env };
  },

  async onCron(params, env, ctx) {
    return this.onCall(params, env, ctx)
  },

  async onRoute(request, env, ctx) {
    return new Response("ok", { status: 200 });
  }
};