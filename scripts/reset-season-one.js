#!/usr/bin/env node

/**
 * Reset Supabase data for Raffle Season #1.
 * Deletes related rows across raffles, InfoFi markets, pricing caches,
 * arbitrage opportunities, players, and winnings. Intended for test reset.
 */

import process from 'node:process';
import { DatabaseService } from '../backend/shared/supabaseClient.js';

async function main() {
  const seasonId = Number(process.env.SEASON_ID ?? '1');
  const db = new DatabaseService();

  if (!Number.isSafeInteger(seasonId) || seasonId <= 0) {
    console.error('Invalid season ID. Provide SEASON_ID environment variable.');
    process.exit(1);
  }

  console.log(`Resetting Supabase data for Season #${seasonId}...`);

  try {
    const { data: markets } = await db.client
      .from('infofi_markets')
      .select('id')
      .eq('raffle_id', seasonId);

    const marketIds = (markets ?? []).map((m) => m.id);

    await db.client.from('infofi_winnings').delete().in('market_id', marketIds);
    await db.client.from('infofi_positions').delete().in('market_id', marketIds);
    await db.client.from('market_pricing_cache').delete().in('market_id', marketIds);
    await db.client.from('arbitrage_opportunities').delete().eq('raffle_id', seasonId);
    await db.client.from('infofi_markets').delete().eq('raffle_id', seasonId);
    await db.client.from('raffles').delete().eq('id', seasonId);

    console.log('Supabase Season reset complete.');
  } catch (error) {
    console.error('Failed to reset Supabase data:', error.message ?? error);
    process.exit(1);
  }
}

main();
