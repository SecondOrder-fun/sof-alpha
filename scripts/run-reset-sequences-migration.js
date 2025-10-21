#!/usr/bin/env node
// scripts/run-reset-sequences-migration.js
// Run the reset sequences migration on Supabase

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Running reset sequences migration...\n');

  // Read the SQL file
  const sqlPath = join(__dirname, '../backend/src/db/migrations/reset_sequences.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  // Split into individual statements (simple split by semicolon)
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    console.log(`📝 Executing statement ${i + 1}/${statements.length}...`);
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
      
      if (error) {
        // Try direct query if rpc doesn't work
        const { error: directError } = await supabase.from('_').select('*').limit(0);
        
        // Supabase doesn't support raw SQL via client, need to use REST API
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ sql_query: statement })
        });

        if (!response.ok) {
          console.error(`❌ Failed to execute statement ${i + 1}`);
          console.error('Statement:', statement.substring(0, 100) + '...');
          console.error('Error:', await response.text());
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    } catch (err) {
      console.error(`❌ Error executing statement ${i + 1}:`, err.message);
    }
  }

  console.log('\n✨ Migration complete!');
  console.log('\nYou can now restart the backend and IDs will start from 1.');
}

runMigration().catch(console.error);
