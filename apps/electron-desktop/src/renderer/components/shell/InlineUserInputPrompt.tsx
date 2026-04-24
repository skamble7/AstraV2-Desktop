/**
 * InlineUserInputPrompt — shown inline in the chat when Claude invokes ask_user.
 *
 * Renders BELOW the most recent assistant message, ABOVE the standard chat input.
 * Input collection is conversational — no modal, no separate form.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/index.js';

interface InlineUserInputPromptProps {
  conversationId: string | null;
}

export function InlineUserInputPrompt({ conversationId }: InlineUserInputPromptProps): React.ReactElement | null {
  const askUserRequest = useAppStore((state) =>
    conversationId
      ? (state.conversationAgentState[conversationId]?.askUserRequest ?? null)
      : null
  );
  const submitUserInput = useAppStore((state) => state.submitUserInput);

  const [inputValue, setInputValue] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (askUserRequest) {
      setInputValue('');
      setSelectedOption('');
      inputRef.current?.focus();
    }
  }, [askUserRequest]);

  if (!askUserRequest) return null;

  const handleSubmit = (): void => {
    const value =
      askUserRequest.input_type === 'select' ? selectedOption : inputValue;
    if (!value.trim()) return;
    void submitUserInput(askUserRequest.token, value);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      style={{
        padding: '10px 12px',
        background: 'rgba(157, 127, 224, 0.08)',
        border: '0.5px solid rgba(157, 127, 224, 0.3)',
        borderRadius: '8px',
        marginBottom: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      <p style={{ fontSize: '13px', color: 'var(--t1)', lineHeight: 1.4 }}>
        <span style={{ color: 'var(--accent-purple)', marginRight: '6px' }}>●</span>
        {askUserRequest.question}
      </p>

      {askUserRequest.input_type === 'select' && askUserRequest.options ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {askUserRequest.options.map((option) => (
            <button
              key={option}
              onClick={() => setSelectedOption(option)}
              style={{
                padding: '5px 10px',
                background: selectedOption === option ? 'var(--accent-purple)' : 'var(--bg3)',
                border: `0.5px solid ${selectedOption === option ? 'var(--accent-purple)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-pill)',
                color: selectedOption === option ? '#fff' : 'var(--t1)',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {option}
            </button>
          ))}
          {selectedOption && (
            <button
              onClick={handleSubmit}
              style={{
                padding: '5px 10px',
                background: 'var(--accent-purple)',
                border: 'none',
                borderRadius: 'var(--radius-pill)',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Confirm →
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '6px' }}>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              askUserRequest.input_type === 'url' ? 'https://…'
              : askUserRequest.input_type === 'file_path' ? '/path/to/file'
              : 'Type your answer…'
            }
            type={askUserRequest.input_type === 'url' ? 'url' : 'text'}
            style={{
              flex: 1,
              background: 'var(--bg2)',
              border: '0.5px solid var(--border)',
              borderRadius: '7px',
              padding: '7px 10px',
              color: 'var(--t0)',
              fontSize: '13px',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!inputValue.trim()}
            style={{
              padding: '7px 12px',
              background: inputValue.trim() ? 'var(--accent-purple)' : 'var(--bg4)',
              border: 'none',
              borderRadius: '7px',
              color: inputValue.trim() ? '#fff' : 'var(--t2)',
              fontSize: '13px',
              cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
