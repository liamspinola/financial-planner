'use strict';

const callClaude = jest.fn().mockResolvedValue('Mock AI response for testing.');

module.exports = { callClaude, CLAUDE_EXE: 'mock-claude' };
