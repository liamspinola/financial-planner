import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../../lib/api.js', () => ({
  api: {
    getConversations: vi.fn(),
    createConversation: vi.fn(),
    deleteConversation: vi.fn(),
    getMessages: vi.fn(),
    sendMessage: vi.fn(),
    patchConversation: vi.fn(),
  },
}))

import { api } from '../../lib/api.js'
import Advisor from '../Advisor.jsx'

const makeConv = (overrides = {}) => ({
  id: 1,
  title: 'New conversation',
  use_context: 1,
  context_snapshot: null,
  summary: null,
  updated_at: new Date().toISOString(),
  message_count: 0,
  ...overrides,
})

const makeMsg = (role, content, seq) => ({
  id: seq,
  conversation_id: 1,
  role,
  content,
  sequence: seq,
  created_at: new Date().toISOString(),
})

// ── relativeDate (via SessionRow) ─────────────────────────────────────────────

describe('relativeDate (via SessionRow)', () => {
  beforeEach(() => {
    api.getConversations.mockResolvedValue([])
    api.getMessages.mockResolvedValue([])
  })

  it('shows "Today" for a timestamp from today', async () => {
    const todayIso = new Date().toISOString()
    api.getConversations.mockResolvedValue([makeConv({ updated_at: todayIso })])
    render(<Advisor />)
    await screen.findByText('Today')
  })

  it('shows "Yesterday" for a timestamp from yesterday', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    api.getConversations.mockResolvedValue([makeConv({ updated_at: yesterday })])
    render(<Advisor />)
    await screen.findByText('Yesterday')
  })
})

// ── Advisor main ──────────────────────────────────────────────────────────────

describe('Advisor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getConversations.mockResolvedValue([])
    api.getMessages.mockResolvedValue([])
  })

  it('shows empty state when no conversations exist', async () => {
    render(<Advisor />)
    await screen.findByText('No session selected')
  })

  it('shows conversation title in sidebar after loading', async () => {
    api.getConversations.mockResolvedValue([makeConv({ title: 'My Chat' })])
    render(<Advisor />)
    // Title appears in both sidebar <p> and ChatPanel <h2>; just assert at least one exists
    await screen.findAllByText('My Chat')
  })

  it('calls api.createConversation when New session button clicked', async () => {
    api.createConversation.mockResolvedValue(makeConv({ id: 99, title: 'New conversation' }))
    render(<Advisor />)
    // Use the sidebar "New session" button specifically (has justify-center class)
    const btns = await screen.findAllByRole('button', { name: /New session/i })
    await userEvent.click(btns[0])
    expect(api.createConversation).toHaveBeenCalledTimes(1)
  })

  it('adds new conversation to sidebar after creating', async () => {
    api.createConversation.mockResolvedValue(makeConv({ id: 5, title: 'New conversation' }))
    render(<Advisor />)
    const btns = await screen.findAllByRole('button', { name: /New session/i })
    await userEvent.click(btns[0])
    await screen.findAllByText('New conversation')
  })

  it('calls api.deleteConversation when delete confirmed', async () => {
    api.getConversations.mockResolvedValue([makeConv({ id: 7, title: 'My Chat' })])
    api.deleteConversation.mockResolvedValue(null)
    render(<Advisor />)
    await screen.findAllByText('My Chat')

    // Target the sidebar <p> element specifically
    const sidebarTitle = screen.getAllByText('My Chat').find(
      el => el.tagName === 'P'
    )
    const row = sidebarTitle.closest('[class*="group"]')
    fireEvent.mouseEnter(row)

    const trashBtn = await screen.findByTitle(/Delete conversation/i)
    await userEvent.click(trashBtn)

    const confirmBtn = await screen.findByTitle(/Confirm delete/i)
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(api.deleteConversation).toHaveBeenCalledWith(7)
    })
  })

  it('removes deleted conversation from sidebar', async () => {
    api.getConversations.mockResolvedValue([makeConv({ id: 7, title: 'My Chat' })])
    api.deleteConversation.mockResolvedValue(null)
    render(<Advisor />)
    await screen.findAllByText('My Chat')

    const sidebarTitle = screen.getAllByText('My Chat').find(el => el.tagName === 'P')
    const row = sidebarTitle.closest('[class*="group"]')
    fireEvent.mouseEnter(row)
    const trashBtn = await screen.findByTitle(/Delete conversation/i)
    await userEvent.click(trashBtn)
    const confirmBtn = await screen.findByTitle(/Confirm delete/i)
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(screen.queryByText('My Chat')).toBeNull()
    })
  })
})

// ── ChatPanel ─────────────────────────────────────────────────────────────────

describe('ChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getConversations.mockResolvedValue([makeConv()])
    api.getMessages.mockResolvedValue([])
  })

  it('renders the chat textarea when a conversation is active', async () => {
    render(<Advisor />)
    await screen.findByPlaceholderText(/Ask anything/i)
  })

  it('shows suggestion pills when chat is empty', async () => {
    render(<Advisor />)
    await screen.findByText(/fastest way to clear my debt/i)
  })

  it('loads and displays existing messages on mount', async () => {
    api.getMessages.mockResolvedValue([
      makeMsg('user', 'Hello', 1),
      makeMsg('assistant', 'Hi there!', 2),
    ])
    render(<Advisor />)
    await screen.findByText('Hello')
    await screen.findByText('Hi there!')
  })

  it('calls api.sendMessage when Send clicked', async () => {
    api.sendMessage.mockResolvedValue({
      userMessage: makeMsg('user', 'Test question', 1),
      assistantMessage: makeMsg('assistant', 'Test answer', 2),
      newTitle: null,
    })
    render(<Advisor />)
    const textarea = await screen.findByPlaceholderText(/Ask anything/i)
    await userEvent.type(textarea, 'Test question')
    const sendBtn = screen.getByTitle(/Send/i)
    await userEvent.click(sendBtn)
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith(1, 'Test question'))
  })

  it('shows user message bubble after sending', async () => {
    api.sendMessage.mockResolvedValue({
      userMessage: makeMsg('user', 'My question', 1),
      assistantMessage: makeMsg('assistant', 'My answer here', 2),
      newTitle: null,
    })
    render(<Advisor />)
    const textarea = await screen.findByPlaceholderText(/Ask anything/i)
    await userEvent.type(textarea, 'My question')
    await userEvent.click(screen.getByTitle(/Send/i))
    await screen.findByText('My question')
  })

  it('shows error message when sendMessage rejects', async () => {
    api.sendMessage.mockRejectedValue(new Error('Claude is unavailable'))
    render(<Advisor />)
    const textarea = await screen.findByPlaceholderText(/Ask anything/i)
    await userEvent.type(textarea, 'This will fail')
    await userEvent.click(screen.getByTitle(/Send/i))
    await screen.findByText(/Claude is unavailable/i)
  })
})

// ── MessageBubble alignment ───────────────────────────────────────────────────

describe('MessageBubble alignment classes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getConversations.mockResolvedValue([makeConv()])
    api.getMessages.mockResolvedValue([
      makeMsg('user', 'User message', 1),
      makeMsg('assistant', 'Assistant message', 2),
    ])
  })

  it('user message element has blue styling', async () => {
    render(<Advisor />)
    await screen.findByText('User message')
    // The text is a direct child of the styled div — check the element itself
    const el = screen.getByText('User message')
    expect(el.className).toMatch(/blue/)
  })

  it('assistant message element does not have blue styling', async () => {
    render(<Advisor />)
    await screen.findByText('Assistant message')
    const el = screen.getByText('Assistant message')
    expect(el.className).not.toMatch(/blue-600/)
  })
})
