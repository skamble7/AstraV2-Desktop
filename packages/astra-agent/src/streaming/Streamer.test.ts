import { describe, it, expect, vi } from 'vitest';
import { Streamer } from './Streamer.js';
import type { AgentEvent } from '../types/stream.types.js';

describe('Streamer', () => {
  it('calls registered listeners when an event is published', () => {
    const streamer = new Streamer();
    const listener = vi.fn();
    streamer.onAgentEvent(listener);

    const event: AgentEvent = { type: 'token', delta: 'hello' };
    streamer.publish(event);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(event);
  });

  it('does not call listener after unsubscribe is invoked', () => {
    const streamer = new Streamer();
    const listener = vi.fn();
    const unsubscribe = streamer.onAgentEvent(listener);

    unsubscribe();
    streamer.publish({ type: 'token', delta: 'ignored' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('broadcasts to multiple listeners', () => {
    const streamer = new Streamer();
    const a = vi.fn();
    const b = vi.fn();
    streamer.onAgentEvent(a);
    streamer.onAgentEvent(b);

    streamer.publish({ type: 'run:completed', run_id: 'run-1' });

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('unsubscribing one listener does not affect others', () => {
    const streamer = new Streamer();
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = streamer.onAgentEvent(a);
    streamer.onAgentEvent(b);

    unsubA();
    streamer.publish({ type: 'run:cancelled' });

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('delivers events in publication order', () => {
    const streamer = new Streamer();
    const received: string[] = [];
    streamer.onAgentEvent((e) => {
      if (e.type === 'token') received.push(e.delta);
    });

    streamer.publish({ type: 'token', delta: 'a' });
    streamer.publish({ type: 'token', delta: 'b' });
    streamer.publish({ type: 'token', delta: 'c' });

    expect(received).toEqual(['a', 'b', 'c']);
  });

  it('handles ask_user event with all fields', () => {
    const streamer = new Streamer();
    const listener = vi.fn();
    streamer.onAgentEvent(listener);

    const event: AgentEvent = {
      type: 'agent:ask_user',
      token: 'tok-123',
      question: 'Which environment?',
      input_type: 'select',
      options: ['dev', 'staging', 'prod'],
    };
    streamer.publish(event);

    expect(listener).toHaveBeenCalledWith(event);
  });
});
