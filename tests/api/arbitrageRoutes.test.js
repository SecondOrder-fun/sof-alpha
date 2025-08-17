// tests/api/arbitrageRoutes.test.js
// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import fastify from 'fastify'

// Mock Supabase before imports
vi.mock('@/../backend/shared/supabaseClient.js', () => ({
  supabase: {},
  db: {},
}))

let app
let arbitrageRoutes
let arbitrageServiceModule

beforeAll(async () => {
  arbitrageRoutes = (await import('@/../backend/fastify/routes/arbitrageRoutes.js')).default
  arbitrageServiceModule = await import('@/../backend/shared/arbitrageService.js')

  app = fastify({ logger: false })
  await app.register(arbitrageRoutes)
  await app.ready()
})

afterAll(async () => {
  if (app) await app.close()
})

describe('arbitrageRoutes', () => {
  it('GET /opportunities returns list', async () => {
    const mock = [{ id: 'opp1' }]
    const spy = vi
      .spyOn(arbitrageServiceModule.arbitrageService, 'detectArbitrageOpportunities')
      .mockResolvedValue(mock)

    const res = await app.inject({ method: 'GET', url: '/opportunities' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.opportunities).toEqual(mock)
    spy.mockRestore()
  })

  it('POST /execute validates body', async () => {
    const res = await app.inject({ method: 'POST', url: '/execute', payload: {} })
    expect(res.statusCode).toBe(400)
  })

  it('POST /execute executes strategy', async () => {
    const result = { success: true }
    const spy = vi
      .spyOn(arbitrageServiceModule.arbitrageService, 'executeArbitrageStrategy')
      .mockResolvedValue(result)

    const res = await app.inject({
      method: 'POST',
      url: '/execute',
      payload: { opportunity_id: 'opp1', player_address: '0xabc' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(result)
    spy.mockRestore()
  })
})
