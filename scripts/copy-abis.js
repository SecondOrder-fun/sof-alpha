/* eslint-disable no-console */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contractsDir = path.join(__dirname, '..', 'contracts', 'out');
const frontendAbisDir = path.join(__dirname, '..', 'src', 'contracts', 'abis');

const contractsToCopy = [
  // Core contracts
  { sourceFile: 'Raffle.sol/Raffle.json', destFile: 'Raffle.json' },
  { sourceFile: 'SeasonFactory.sol/SeasonFactory.json', destFile: 'SeasonFactory.json' },

  // Curve + tokens
  { sourceFile: 'SOFBondingCurve.sol/SOFBondingCurve.json', destFile: 'SOFBondingCurve.json' },
  { sourceFile: 'RaffleToken.sol/RaffleToken.json', destFile: 'RaffleToken.json' },
  { sourceFile: 'SOFToken.sol/SOFToken.json', destFile: 'SOFToken.json' },

  // InfoFi
  { sourceFile: 'InfoFiMarket.sol/InfoFiMarket.json', destFile: 'InfoFiMarket.json' },
  { sourceFile: 'InfoFiMarketFactory.sol/InfoFiMarketFactory.json', destFile: 'InfoFiMarketFactory.json' },
  { sourceFile: 'InfoFiPriceOracle.sol/InfoFiPriceOracle.json', destFile: 'InfoFiPriceOracle.json' },
  { sourceFile: 'InfoFiSettlement.sol/InfoFiSettlement.json', destFile: 'InfoFiSettlement.json' },

  // Position tracker
  { sourceFile: 'RafflePositionTracker.sol/RafflePositionTracker.json', destFile: 'RafflePositionTracker.json' },
];

async function copyAbis() {
  try {
    await fs.mkdir(frontendAbisDir, { recursive: true });

    for (const contract of contractsToCopy) {
      const sourcePath = path.join(contractsDir, contract.sourceFile);
      const destPath = path.join(frontendAbisDir, contract.destFile);

      try {
        const fileContent = await fs.readFile(sourcePath, 'utf8');
        const contractJson = JSON.parse(fileContent);
        if (contractJson.abi) {
          await fs.writeFile(destPath, JSON.stringify(contractJson.abi, null, 2));
          console.log(`Copied ABI for ${contract.destFile} to ${destPath}`);
        } else {
          console.error(`Error: ABI not found in ${sourcePath}`);
        }
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.error(`Error: Source file not found at ${sourcePath}`);
        } else {
          console.error(`Failed to copy ${contract.sourceFile}:`, error);
        }
      }
    }

    console.log('ABI copy process finished.');
  } catch (error) {
    console.error('An error occurred during the ABI copy process:', error);
  }
}

copyAbis();
