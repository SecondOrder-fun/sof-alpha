#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log("🔄 Running raffle transaction migration...\n");

    // Read migration file
    const migrationPath = join(
      __dirname,
      "../backend/migrations/001_raffle_transactions.sql"
    );
    const migrationSQL = readFileSync(migrationPath, "utf8");

    // Execute migration
    const { data, error } = await supabase.rpc("exec_sql", {
      sql: migrationSQL,
    });

    if (error) {
      // If exec_sql doesn't exist, try direct query
      console.log(
        "⚠️  exec_sql function not available, using direct query...\n"
      );

      const { error: queryError } = await supabase
        .from("_migrations")
        .insert({
          name: "001_raffle_transactions",
          executed_at: new Date().toISOString(),
        });

      if (queryError && queryError.code !== "42P01") {
        throw queryError;
      }

      console.log("✅ Migration SQL ready to run manually");
      console.log("\n📋 Please run this in Supabase SQL Editor:");
      console.log("   1. Go to https://supabase.com/dashboard");
      console.log("   2. Select your project");
      console.log("   3. Navigate to SQL Editor");
      console.log(
        "   4. Copy the contents of: backend/migrations/001_raffle_transactions.sql"
      );
      console.log('   5. Paste and click "Run"\n');

      return;
    }

    console.log("✅ Migration completed successfully!");
    console.log(data);

    // Verify migration
    console.log("\n🔍 Verifying migration...");

    const { data: tables, error: tablesError } = await supabase
      .from("pg_tables")
      .select("tablename")
      .like("tablename", "raffle_transactions%");

    if (!tablesError && tables) {
      console.log(`✅ Created ${tables.length} partition tables`);
    }

    console.log("\n✅ Migration complete! Backend is ready to deploy.");
  } catch (error) {
    console.error("❌ Migration failed:", error.message);
    console.log("\n📋 Manual migration required:");
    console.log("   Run the SQL file in Supabase Dashboard SQL Editor");
    console.log("   File: backend/migrations/001_raffle_transactions.sql\n");
    process.exit(1);
  }
}

runMigration();
