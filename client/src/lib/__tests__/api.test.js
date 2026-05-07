import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api.js'

// Stub global fetch before any tests run
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Stub AbortController so timeouts don't interfere
vi.stubGlobal('AbortController', class {
  constructor() {
    this.signal = {
      aborted: false,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
  }
  abort() { this.signal.aborted = true; }
})

describe('api request helper', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    vi.clearAllTimers()
  })

  // ── Bug 1 TDD proof ────────────────────────────────────────────────────────
  it('204 No Content resolves to null without throwing (Bug 1 regression)', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 204,
      ok: true,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected end of JSON input')),
    })
    const result = await api.deleteConversation(1)
    expect(result).toBeNull()
  })

  // ── Non-ok responses ───────────────────────────────────────────────────────
  it('throws with status and error message when server returns non-ok', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 404,
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Not found' }),
    })
    await expect(api.getConversations()).rejects.toMatchObject({
      message: 'Not found',
      status: 404,
    })
  })

  it('throws "Request failed" when non-ok response has no error field', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: vi.fn().mockResolvedValue({}),
    })
    await expect(api.getConversations()).rejects.toMatchObject({
      message: 'Request failed',
      status: 500,
    })
  })

  // ── Successful JSON responses ──────────────────────────────────────────────
  it('returns parsed JSON body on 200 response', async () => {
    const fakeConvs = [{ id: 1, title: 'Test' }]
    mockFetch.mockResolvedValueOnce({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(fakeConvs),
    })
    const result = await api.getConversations()
    expect(result).toEqual(fakeConvs)
  })

  it('sends POST request to correct URL', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 201,
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 1 }),
    })
    await api.createConversation()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/advisor/conversations',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
