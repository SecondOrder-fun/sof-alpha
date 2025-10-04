#!/usr/bin/env node
// scripts/test-username-api.js
// Quick manual test of username API endpoints

import axios from 'axios';

const API_BASE = 'http://localhost:3000/api';
const TEST_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0';
const TEST_USERNAME = 'alice_' + (Date.now() % 10000); // Keep it under 20 chars

async function testUsernameAPI() {
  console.log('🧪 Testing Username API...\n');

  try {
    // Test 1: Get username for address (should be null initially)
    console.log('1️⃣ GET username for address (should be null)');
    const getResponse1 = await axios.get(`${API_BASE}/usernames/${TEST_ADDRESS}`);
    console.log('   Response:', getResponse1.data);
    console.log('   ✅ GET username works\n');

    // Test 2: Check username availability
    console.log('2️⃣ Check username availability');
    const checkResponse = await axios.get(`${API_BASE}/usernames/check/${TEST_USERNAME}`);
    console.log('   Response:', checkResponse.data);
    console.log('   ✅ Check availability works\n');

    // Test 3: Set username
    console.log('3️⃣ POST set username');
    const setResponse = await axios.post(`${API_BASE}/usernames`, {
      address: TEST_ADDRESS,
      username: TEST_USERNAME,
    });
    console.log('   Response:', setResponse.data);
    console.log('   ✅ Set username works\n');

    // Test 4: Get username again (should return the username we just set)
    console.log('4️⃣ GET username again (should return set username)');
    const getResponse2 = await axios.get(`${API_BASE}/usernames/${TEST_ADDRESS}`);
    console.log('   Response:', getResponse2.data);
    console.log('   ✅ Username persisted correctly\n');

    // Test 5: Try to set duplicate username (should fail)
    console.log('5️⃣ Try to set duplicate username (should fail)');
    try {
      await axios.post(`${API_BASE}/usernames`, {
        address: '0x1234567890123456789012345678901234567890',
        username: TEST_USERNAME,
      });
      console.log('   ❌ Should have failed but succeeded');
    } catch (error) {
      console.log('   Response:', error.response?.data);
      console.log('   ✅ Duplicate username rejected correctly\n');
    }

    // Test 6: Batch lookup
    console.log('6️⃣ Batch username lookup');
    const batchResponse = await axios.get(`${API_BASE}/usernames/batch`, {
      params: {
        addresses: `${TEST_ADDRESS},0x1234567890123456789012345678901234567890`,
      },
    });
    console.log('   Response:', batchResponse.data);
    console.log('   ✅ Batch lookup works\n');

    console.log('🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  }
}

testUsernameAPI();
