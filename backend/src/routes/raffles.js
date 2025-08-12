// backend/src/routes/raffles.js
// Fastify routes to expose onchain-backed raffle data (read-only)

import { getChainByKey } from "../config/chain.js";
import { getPublicClient } from "../lib/viemClient.js";
import RaffleAbi from "../abis/RaffleAbi.js";

/**
 * Registers raffle routes.
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function raffleRoutes(fastify) {
  // GET /api/raffles?network=LOCAL
  fastify.get("/api/raffles", async (request, reply) => {
    const network = String(request.query.network || process.env.DEFAULT_NETWORK || "LOCAL");
    const chain = getChainByKey(network);
    const client = getPublicClient(network);

    if (!chain.raffle) {
      return reply.code(200).send({ items: [], network, message: "RAFFLE address not set" });
    }

    try {
      const currentSeasonId = await client.readContract({
        address: chain.raffle,
        abi: RaffleAbi,
        functionName: "currentSeasonId",
        args: [],
      });
      return { items: currentSeasonId != null ? [{ id: Number(currentSeasonId) }] : [], network };
    } catch (err) {
      request.log.error({ err }, "raffles list failed");
      return reply.code(500).send({ error: "ONCHAIN_READ_FAILED" });
    }
  });

  // GET /api/raffles/:id
  fastify.get("/api/raffles/:id", async (request, reply) => {
    const { id } = request.params;
    const network = String(request.query.network || process.env.DEFAULT_NETWORK || "LOCAL");
    const chain = getChainByKey(network);
    // const client = getPublicClient(network); // Uncomment when onchain reads are wired

    if (!chain.raffle) return reply.code(404).send({ error: "RAFFLE_NOT_CONFIGURED" });

    try {
      // TODO: implement getSeasonDetails read when ABI is added
      const details = null;
      return { id: Number(id), details, network };
    } catch (err) {
      request.log.error({ err }, "raffle details failed");
      return reply.code(500).send({ error: "ONCHAIN_READ_FAILED" });
    }
  });

  // GET /api/raffles/:id/positions
  fastify.get("/api/raffles/:id/positions", async (request, reply) => {
    const { id } = request.params;
    const network = String(request.query.network || process.env.DEFAULT_NETWORK || "LOCAL");
    const chain = getChainByKey(network);
    // const client = getPublicClient(network); // Uncomment when onchain reads are wired

    if (!chain.raffle) return reply.code(404).send({ error: "RAFFLE_NOT_CONFIGURED" });

    try {
      // Placeholder: once events & storage layout are set, use getLogs & reads to aggregate
      // const logs = await client.getLogs({ address: chain.raffle, event: RaffleAbi.events.PositionUpdate, fromBlock: 0n, toBlock: 'latest' });
      return { id: Number(id), positions: [], network };
    } catch (err) {
      request.log.error({ err }, "raffle positions failed");
      return reply.code(500).send({ error: "ONCHAIN_READ_FAILED" });
    }
  });
}
