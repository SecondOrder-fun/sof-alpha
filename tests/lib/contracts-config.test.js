// tests/lib/contracts-config.test.js
import { describe, it, expect } from 'vitest'
import { getContractAddresses, CONTRACTS, RAFFLE_ABI } from '@/config/contracts'

describe('config/contracts', () => {
  it('returns LOCAL by default', () => {
    const addr = getContractAddresses()
    expect(addr).toEqual(CONTRACTS.LOCAL)
  })

  it('returns TESTNET when key provided', () => {
    const addr = getContractAddresses('TESTNET')
    expect(addr).toEqual(CONTRACTS.TESTNET)
  })

  it('RAFFLE_ABI is defined and non-empty array', () => {
    expect(Array.isArray(RAFFLE_ABI)).toBe(true)
    expect(RAFFLE_ABI.length).toBeGreaterThan(0)
  })
})
