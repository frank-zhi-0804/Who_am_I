import { createAgentApi } from './agent.mjs';

// Reuse per-isolate limits. Deployment-wide quotas require a persistent limiter.
let currentEnvironment, handler;
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      if (env !== currentEnvironment) { currentEnvironment = env; handler = createAgentApi(env); }
      return handler(request, { clientId: request.headers.get('CF-Connecting-IP') || 'anonymous' });
    }
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Static assets are not configured.', { status: 404 });
  }
};
