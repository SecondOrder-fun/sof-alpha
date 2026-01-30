import { createPublicClient, http } from 'viem'
import fs from 'node:fs'
import path from 'node:path'

const rpcUrl = 'https://sepolia.base.org'
const raffleAddress = '0x1Aa8bba811c6E4E7E0E739de6Ea4c96dF837909D'
const infoFiFactoryAddress = '0x153d9E13ccC1f53a4286656BF978f870bb24AB94'

const client = createPublicClient({ transport: http(rpcUrl) })

const raffleAbi = JSON.parse(fs.readFileSync(path.resolve('src/contracts/abis/Raffle.json'), 'utf-8'))
const curveAbi = JSON.parse(fs.readFileSync(path.resolve('src/contracts/abis/SOFBondingCurve.json'), 'utf-8'))
const factoryAbi = JSON.parse(fs.readFileSync(path.resolve('src/contracts/abis/InfoFiMarketFactory.json'), 'utf-8'))

const seasonStartedEvent = raffleAbi.find((x) => x.type === 'event' && x.name === 'SeasonStarted')
const positionUpdateEvent = curveAbi.find((x) => x.type === 'event' && x.name === 'PositionUpdate')
const marketCreatedEvent = factoryAbi.find((x) => x.type === 'event' && x.name === 'MarketCreated')

function clampBigint(n) {
  if (n < 0n) return 0n
  return n
}

async function getSeasonDetails(seasonId) {
  const res = await client.readContract({
    address: raffleAddress,
    abi: raffleAbi,
    functionName: 'getSeasonDetails',
    args: [BigInt(seasonId)],
  })
  const config = res[0]
  const status = res[1]
  const totalParticipants = res[2]
  const totalTickets = res[3]
  const totalPrizePool = res[4]
  return { config, status, totalParticipants, totalTickets, totalPrizePool }
}

async function queryLogsInChunks({ address, eventAbi, fromBlock, toBlock }) {
  const maxRange = 10_000n
  const out = []
  let start = fromBlock
  while (start <= toBlock) {
    const end = start + maxRange - 1n > toBlock ? toBlock : start + maxRange - 1n
    const logs = await client.getLogs({
      address,
      event: {
        name: eventAbi.name,
        type: 'event',
        inputs: eventAbi.inputs,
      },
      fromBlock: start,
      toBlock: end,
    })
    out.push(...logs)
    start = end + 1n
  }
  return out
}

async function main() {
  const currentBlock = await client.getBlockNumber()
  const latestBlock = await client.getBlock({ blockNumber: currentBlock })
  const nowTs = Number(latestBlock.timestamp)

  console.log('RPC', rpcUrl)
  console.log('Raffle', raffleAddress)
  console.log('InfoFiFactory', infoFiFactoryAddress)
  console.log('Current block', currentBlock.toString(), 'ts', nowTs)

  const seasonsToCheck = [7, 8, 9, 10, 11, 12, 13, 14]
  const seasonInfo = []

  for (const sid of seasonsToCheck) {
    try {
      const d = await getSeasonDetails(sid)
      const cfg = d.config
      seasonInfo.push({
        seasonId: sid,
        startTime: Number(cfg.startTime),
        endTime: Number(cfg.endTime),
        raffleToken: cfg.raffleToken,
        bondingCurve: cfg.bondingCurve,
        isActive: cfg.isActive,
        isCompleted: cfg.isCompleted,
        status: Number(d.status),
        totalTickets: d.totalTickets.toString(),
      })
    } catch (e) {
      seasonInfo.push({ seasonId: sid, error: e?.shortMessage || e?.message || String(e) })
    }
  }

  console.log('\n=== Season Details (7-14) ===')
  for (const s of seasonInfo) console.log(JSON.stringify(s))

  for (const sid of [13, 14]) {
    const s = seasonInfo.find((x) => x.seasonId === sid)
    if (!s || s.error) {
      console.log(`\n[Season ${sid}] No season details available (error).`)
      continue
    }

    const startTime = s.startTime
    const deltaSec = Math.max(0, nowTs - startTime)
    const approxBlocksAgo = BigInt(Math.floor(deltaSec / 2))
    const approxStartBlock = clampBigint(currentBlock - approxBlocksAgo)
    const fromBlock = clampBigint(approxStartBlock - 20_000n)

    console.log(`\n[Season ${sid}] bondingCurve=${s.bondingCurve}`)
    console.log(`[Season ${sid}] approxStartBlock=${approxStartBlock.toString()} fromBlock=${fromBlock.toString()} currentBlock=${currentBlock.toString()}`)

    const posLogs = await queryLogsInChunks({
      address: s.bondingCurve,
      eventAbi: positionUpdateEvent,
      fromBlock,
      toBlock: currentBlock,
    })

    console.log(`[Season ${sid}] PositionUpdate logs found: ${posLogs.length}`)
    let crossings = 0
    for (const l of posLogs) {
      const { oldTickets, newTickets, totalTickets, player } = l.args
      const total = Number(totalTickets)
      const oldP = total > 0 ? Math.floor((Number(oldTickets) * 10000) / total) : 0
      const newP = total > 0 ? Math.floor((Number(newTickets) * 10000) / total) : 0
      if (oldP < 100 && newP >= 100) {
        crossings++
        console.log(`  THRESHOLD_CROSS tx=${l.transactionHash} block=${l.blockNumber} player=${player} oldP=${oldP} newP=${newP} old=${oldTickets} new=${newTickets} total=${totalTickets}`)
      }
    }
    console.log(`[Season ${sid}] threshold crossings detected: ${crossings}`)

    const mcLogs = await queryLogsInChunks({
      address: infoFiFactoryAddress,
      eventAbi: marketCreatedEvent,
      fromBlock,
      toBlock: currentBlock,
    })

    const mcForSeason = mcLogs.filter((l) => Number(l.args.seasonId) === sid)
    console.log(`[Season ${sid}] MarketCreated logs found (factory, filtered): ${mcForSeason.length}`)
    for (const l of mcForSeason) {
      const { player, fpmmAddress, marketType, conditionId } = l.args
      console.log(`  MarketCreated tx=${l.transactionHash} block=${l.blockNumber} player=${player} fpmm=${fpmmAddress} marketType=${marketType} conditionId=${conditionId}`)
    }
  }

  {
    const fromBlock = clampBigint(currentBlock - 300_000n)
    const logs = await queryLogsInChunks({
      address: raffleAddress,
      eventAbi: seasonStartedEvent,
      fromBlock,
      toBlock: currentBlock,
    })

    const counts = new Map()
    for (const l of logs) {
      const sid = Number(l.args.seasonId)
      counts.set(sid, (counts.get(sid) || 0) + 1)
    }

    console.log('\n=== SeasonStarted logs in last 300k blocks (counts) ===')
    for (const sid of seasonsToCheck) {
      console.log(`Season ${sid}: ${counts.get(sid) || 0}`)
    }
  }
}

main().catch((e) => {
  console.error('Fatal', e)
  process.exit(1)
})
