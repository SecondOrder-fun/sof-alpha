import process from 'node:process';
import { db } from '../../shared/supabaseClient.js';

async function checkSupabase() {
  try {
    // lightweight query; table may be empty (avoid methods not in stub)
    await db.client.from('infofi_markets').select('id');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

async function checkRpc(rpcUrl) {
  if (!rpcUrl) return { ok: false, error: 'RPC URL not configured' };
  try {
    if (typeof globalThis.fetch !== 'function') {
      return { ok: false, error: 'fetch is not available in this Node runtime' };
    }
    const res = await globalThis.fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    const chainIdHex = json?.result;
    return { ok: !!chainIdHex, chainId: chainIdHex || null };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function healthRoutes(fastify, options) {
  // options unused; required by Fastify
  if (options) {
    // no-op
  }

  fastify.get('/health', async (_request, reply) => {
    const startedAt = Date.now();
    try {
      // ENV presence
      const env = {
        DEFAULT_NETWORK: process.env.DEFAULT_NETWORK || null,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
        RPC_URL_LOCAL: !!process.env.RPC_URL_LOCAL,
        RPC_URL_TESTNET: !!process.env.RPC_URL_TESTNET,
      };

      const supabase = await checkSupabase();

      const network = (process.env.DEFAULT_NETWORK || 'LOCAL').toUpperCase();
      const rpcUrl = network === 'TESTNET' ? process.env.RPC_URL_TESTNET : process.env.RPC_URL_LOCAL;
      const rpc = await checkRpc(rpcUrl);

      const status = supabase.ok && rpc.ok ? 'OK' : 'DEGRADED';

      return reply.send({
        status,
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        env,
        checks: {
          supabase,
          rpc,
          network,
        },
      });
    } catch (err) {
      fastify.log.error({ err }, 'health route error');
      return reply.code(200).send({
        status: 'DEGRADED',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startedAt,
        env: {
          DEFAULT_NETWORK: process.env.DEFAULT_NETWORK || null,
          SUPABASE_URL: !!process.env.SUPABASE_URL,
          SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
          RPC_URL_LOCAL: !!process.env.RPC_URL_LOCAL,
          RPC_URL_TESTNET: !!process.env.RPC_URL_TESTNET,
        },
        checks: { error: String(err?.message || err) },
      });
    }
  });
}

export default healthRoutes;
