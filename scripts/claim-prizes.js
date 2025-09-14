const { createWalletClient, http, publicActions } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { anvil } = require('viem/chains');
const fs = require('fs');
const path = require('path');

const raffleAbi = require('../src/contracts/abis/Raffle.json');
const prizeDistributorAbi = require('../src/contracts/abis/RafflePrizeDistributor.json');

const ANVIL_RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const RAFFLE_ADDRESS = process.env.RAFFLE_ADDRESS;
const PRIZE_DISTRIBUTOR_ADDRESS = process.env.PRIZE_DISTRIBUTOR_ADDRESS;
const SEASON_ID = parseInt(process.env.SEASON_ID || '1', 10);

const pks = [
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    '0x47e179ec197488593b187f803b4750ac53b17c7d3a9bb2864537d7e623258b99',
    '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
    '0x921b31e16af0336d8f615e23de146b31d4932ade2476944c43e424bf611be7a3',
    '0xda61b4a8a7606b1d86b60224b86b630a9af5df846c2b7b4b99d97bd45f9e8589',
    '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
    '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897',
];

const accounts = pks.map(pk => privateKeyToAccount(pk));

async function main() {
    if (!RAFFLE_ADDRESS || !PRIZE_DISTRIBUTOR_ADDRESS) {
        throw new Error('RAFFLE_ADDRESS and PRIZE_DISTRIBUTOR_ADDRESS must be set in environment');
    }

    const client = createWalletClient({
        chain: anvil,
        transport: http(ANVIL_RPC_URL),
    }).extend(publicActions);

    console.log('Fetching winners...');
    const winners = await client.readContract({
        address: RAFFLE_ADDRESS,
        abi: raffleAbi,
        functionName: 'getWinners',
        args: [SEASON_ID],
    });

    const grandWinner = winners[0];
    console.log(`Grand winner for Season ${SEASON_ID} is: ${grandWinner}`);

    const merklePath = path.join(__dirname, `../public/merkle/season-${SEASON_ID}.json`);
    const merkleData = JSON.parse(fs.readFileSync(merklePath, 'utf8'));

    for (const account of accounts) {
        const isWinner = account.address.toLowerCase() === grandWinner.toLowerCase();

        const walletClient = createWalletClient({
            account,
            chain: anvil,
            transport: http(ANVIL_RPC_URL),
        });

        if (isWinner) {
            console.log(`Account ${account.address} is the grand winner. Claiming grand prize...`);
            try {
                const hash = await walletClient.writeContract({
                    address: PRIZE_DISTRIBUTOR_ADDRESS,
                    abi: prizeDistributorAbi,
                    functionName: 'claimGrand',
                    args: [SEASON_ID],
                });
                console.log(`  > Grand prize claim tx: ${hash}`);
            } catch (e) {
                console.error(`  > Failed to claim grand prize for ${account.address}:`, e.message);
            }
        } else {
            const leaf = merkleData.leaves.find(l => l.account.toLowerCase() === account.address.toLowerCase());
            if (leaf) {
                console.log(`Account ${account.address} is a consolation winner. Claiming...`);
                try {
                    const hash = await walletClient.writeContract({
                        address: PRIZE_DISTRIBUTOR_ADDRESS,
                        abi: prizeDistributorAbi,
                        functionName: 'claimConsolation',
                        args: [SEASON_ID, leaf.index, leaf.account, BigInt(leaf.amount), leaf.proof],
                    });
                    console.log(`  > Consolation prize claim tx: ${hash}`);
                } catch (e) {
                    console.error(`  > Failed to claim consolation prize for ${account.address}:`, e.message);
                }
            } else {
                console.log(`Account ${account.address} has no consolation prize to claim.`);
            }
        }
    }

    console.log('\nPrize claim process finished.');
}

main().catch(console.error);
