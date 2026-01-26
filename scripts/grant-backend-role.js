#!/usr/bin/env node
// scripts/grant-backend-role.js
// Grants BACKEND_ROLE to the backend wallet on InfoFiMarketFactory

import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, "..", ".env") });

async function main() {
  console.log("🔐 Granting BACKEND_ROLE to Backend Wallet\n");

  // Load configuration
  const rpcUrl = process.env.RPC_URL_LOCAL || "http://127.0.0.1:8545";
  const factoryAddress = process.env.INFOFI_FACTORY_ADDRESS_LOCAL;
  const adminPrivateKey = process.env.PRIVATE_KEY;
  const backendPrivateKey =
    process.env.BACKEND_WALLET_PRIVATE_KEY || process.env.PRIVATE_KEY;

  if (!factoryAddress) {
    console.error("❌ INFOFI_FACTORY_ADDRESS_LOCAL not set in .env");
    process.exit(1);
  }

  if (!adminPrivateKey) {
    console.error("❌ PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  if (!backendPrivateKey) {
    console.error("❌ BACKEND_WALLET_PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  // Create clients
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(rpcUrl),
  });

  const adminAccount = privateKeyToAccount(adminPrivateKey);
  const backendAccount = privateKeyToAccount(backendPrivateKey);

  const walletClient = createWalletClient({
    account: adminAccount,
    chain: foundry,
    transport: http(rpcUrl),
  });

  console.log("📋 Configuration:");
  console.log(`  RPC URL: ${rpcUrl}`);
  console.log(`  Factory: ${factoryAddress}`);
  console.log(`  Admin: ${adminAccount.address}`);
  console.log(`  Backend: ${backendAccount.address}\n`);

  // InfoFiMarketFactory ABI (minimal)
  const factoryAbi = [
    {
      type: "function",
      name: "hasRole",
      inputs: [
        { name: "role", type: "bytes32" },
        { name: "account", type: "address" },
      ],
      outputs: [{ name: "", type: "bool" }],
      stateMutability: "view",
    },
    {
      type: "function",
      name: "grantRole",
      inputs: [
        { name: "role", type: "bytes32" },
        { name: "account", type: "address" },
      ],
      outputs: [],
      stateMutability: "nonpayable",
    },
    {
      type: "function",
      name: "BACKEND_ROLE",
      inputs: [],
      outputs: [{ name: "", type: "bytes32" }],
      stateMutability: "view",
    },
  ];

  try {
    // Get the actual BACKEND_ROLE hash from contract
    const backendRoleHash = await publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "BACKEND_ROLE",
    });

    console.log(`🔑 BACKEND_ROLE hash: ${backendRoleHash}\n`);

    // Check if backend already has the role
    const hasRole = await publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "hasRole",
      args: [backendRoleHash, backendAccount.address],
    });

    console.log(`📊 Current Status:`);
    console.log(`  Backend has BACKEND_ROLE: ${hasRole}\n`);

    if (hasRole) {
      console.log(
        "✅ Backend wallet already has BACKEND_ROLE - no action needed",
      );
      return;
    }

    // Grant the role
    console.log("🚀 Granting BACKEND_ROLE to backend wallet...");

    const hash = await walletClient.writeContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: "grantRole",
      args: [backendRoleHash, backendAccount.address],
      account: adminAccount,
    });

    console.log(`📝 Transaction submitted: ${hash}`);
    console.log("⏳ Waiting for confirmation...");

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === "success") {
      console.log("✅ Transaction confirmed!\n");

      // Verify the role was granted
      const hasRoleAfter = await publicClient.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: "hasRole",
        args: [backendRoleHash, backendAccount.address],
      });

      console.log("📊 Final Status:");
      console.log(`  Backend has BACKEND_ROLE: ${hasRoleAfter}\n`);

      if (hasRoleAfter) {
        console.log("🎉 SUCCESS: BACKEND_ROLE granted successfully!");
        console.log(
          "   Backend can now call onPositionUpdate() to create InfoFi markets\n",
        );
      } else {
        console.error(
          "❌ ERROR: Role grant failed - verification check failed",
        );
        process.exit(1);
      }
    } else {
      console.error("❌ Transaction failed");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.message.includes("AccessControl")) {
      console.error(
        "\n💡 Hint: Make sure the admin wallet has DEFAULT_ADMIN_ROLE on the factory",
      );
    }
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
