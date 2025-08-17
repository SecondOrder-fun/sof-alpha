// tests/setup.js
// Global setup for Vitest (jsdom)
import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// JSDOM lacks EventSource; some tests will mock it per-test. Provide a default noop to avoid ReferenceErrors.
if (typeof global.EventSource === 'undefined') {
  // minimal stub; specific tests will override behavior
  // eslint-disable-next-line no-undef
  global.EventSource = class {
    constructor() {}
    close() {}
  }
}

// Clean up timers/mocks between tests
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})
