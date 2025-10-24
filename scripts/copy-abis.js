/* eslint-disable no-console */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contractsDir = path.join(__dirname, '..', 'contracts', 'out');
const frontendAbisDir = path.join(__dirname, '..', 'src', 'contracts', 'abis');
const backendAbisDir = path.join(__dirname, '..', 'backend', 'src', 'abis');

const contractsToCopy = [
  // Core contracts
  { sourceFile: 'Raffle.sol/Raffle.json', destFile: 'Raffle.json' },
  { sourceFile: 'SeasonFactory.sol/SeasonFactory.json', destFile: 'SeasonFactory.json' },
  { sourceFile: 'RafflePrizeDistributor.sol/RafflePrizeDistributor.json', destFile: 'RafflePrizeDistributor.json' },

  // Curve + tokens
  { sourceFile: 'SOFBondingCurve.sol/SOFBondingCurve.json', destFile: 'SOFBondingCurve.json' },
  { sourceFile: 'RaffleToken.sol/RaffleToken.json', destFile: 'RaffleToken.json' },
  { sourceFile: 'SOFToken.sol/SOFToken.json', destFile: 'SOFToken.json' },

  // Faucet
  { sourceFile: 'SOFFaucet.sol/SOFFaucet.json', destFile: 'SOFFaucet.json' },

  // InfoFi
  { sourceFile: 'InfoFiMarket.sol/InfoFiMarket.json', destFile: 'InfoFiMarket.json' },
  { sourceFile: 'InfoFiMarketFactory.sol/InfoFiMarketFactory.json', destFile: 'InfoFiMarketFactory.json' },
  { sourceFile: 'InfoFiPriceOracle.sol/InfoFiPriceOracle.json', destFile: 'InfoFiPriceOracle.json' },
  { sourceFile: 'InfoFiSettlement.sol/InfoFiSettlement.json', destFile: 'InfoFiSettlement.json' },
  
  // InfoFi FPMM (V2)
  { sourceFile: 'RaffleOracleAdapter.sol/RaffleOracleAdapter.json', destFile: 'RaffleOracleAdapter.json' },
  { sourceFile: 'InfoFiFPMMV2.sol/InfoFiFPMMV2.json', destFile: 'InfoFiFPMMV2.json' },
  { sourceFile: 'InfoFiFPMMV2.sol/SimpleFPMM.json', destFile: 'SimpleFPMM.json' },
  { sourceFile: 'InfoFiFPMMV2.sol/SOLPToken.json', destFile: 'SOLPToken.json' },
  { sourceFile: 'ConditionalTokenSOF.sol/ConditionalTokenSOF.json', destFile: 'ConditionalTokenSOF.json' },

  // Position tracker
  { sourceFile: 'RafflePositionTracker.sol/RafflePositionTracker.json', destFile: 'RafflePositionTracker.json' },
];

// Backend services need these ABIs (subset of above, in JS format for ES modules)
const backendAbiNeeds = [
  'SOFBondingCurve.json',
  'InfoFiMarketFactory.json',
  'InfoFiPriceOracle.json',
  'Raffle.json',
  'RafflePositionTracker.json',
];

async function copyAbis() {
  try {
    await fs.mkdir(frontendAbisDir, { recursive: true });
    await fs.mkdir(backendAbisDir, { recursive: true });

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

    // Copy backend ABIs (as ES module .js files)
    console.log('\nCopying backend ABIs...');
    for (const abiFileName of backendAbiNeeds) {
      const frontendAbiPath = path.join(frontendAbisDir, abiFileName);
      const backendAbiName = abiFileName.replace('.json', 'Abi.js');
      const backendAbiPath = path.join(backendAbisDir, backendAbiName);

      try {
        const abiContent = await fs.readFile(frontendAbiPath, 'utf8');
        const abiArray = JSON.parse(abiContent);
        
        // Create ES module wrapper
        const jsContent = `// Auto-generated from ${abiFileName}\n// Do not edit manually - run 'npm run copy-abis' to regenerate\n\nexport default ${JSON.stringify(abiArray, null, 2)};\n`;
        
        await fs.writeFile(backendAbiPath, jsContent);
        console.log(`Copied backend ABI: ${backendAbiName}`);
      } catch (error) {
        console.error(`Failed to copy backend ABI ${abiFileName}:`, error.message);
      }
    }

    console.log('\nABI copy process finished.');
  } catch (error) {
    console.error('An error occurred during the ABI copy process:', error);
  }
}

copyAbis();
