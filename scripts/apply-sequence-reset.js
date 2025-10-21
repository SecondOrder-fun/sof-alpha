#!/usr/bin/env node
// Apply the sequence reset by using Supabase's raw SQL execution
// This requires the SQL to be run manually in Supabase dashboard

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\n⚠️  Supabase client does not support raw SQL execution.');
console.log('\nPlease run this SQL in your Supabase SQL Editor:\n');
console.log('─'.repeat(60));
console.log(`
CREATE OR REPLACE FUNCTION reset_infofi_markets_sequence()
RETURNS void AS $$
BEGIN
  PERFORM setval(pg_get_serial_sequence('infofi_markets', 'id'), 1, false);
END;
$$ LANGUAGE plpgsql;
`);
console.log('─'.repeat(60));
console.log('\nThen restart your backend to apply the changes.\n');
console.log('Supabase Dashboard: ' + supabaseUrl.replace('/rest/v1', '') + '/project/_/sql');
