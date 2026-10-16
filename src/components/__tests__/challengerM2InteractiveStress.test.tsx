import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../../App';

describe('Empirical Challenger R2-2: Interactive Form Control Hotkey Isolation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('verifies that typing "h", "H", "m", "M", or arrow keys inside an <input> element never hijacks HUD or toggles panel', () => {
    render(<App />);

    // Director panel starts visible
    expect(screen.getByText('DEMO DIRECTOR PANEL')).toBeDefined();

    // Find YouTube URL input field
    const youtubeInput = screen.getByPlaceholderText('Dán link YouTube (URL / ID)...');
    youtubeInput.focus();

    // 1. Send 'h' and 'H' keystrokes to input
    fireEvent.keyDown(youtubeInput, { key: 'h' });
    expect(screen.queryByText('DEMO DIRECTOR PANEL')).not.toBeNull();

    fireEvent.keyDown(youtubeInput, { key: 'H' });
    expect(screen.queryByText('DEMO DIRECTOR PANEL')).not.toBeNull();

    // 2. Send 'm' and 'M' keystrokes to input
    const initialMuteTitle = screen.getByTitle('Tắt tiếng cảnh báo');
    expect(initialMuteTitle).toBeDefined();

    fireEvent.keyDown(youtubeInput, { key: 'm' });
    expect(screen.getByTitle('Tắt tiếng cảnh báo')).toBeDefined(); // Still unmuted

    fireEvent.keyDown(youtubeInput, { key: 'M' });
    expect(screen.getByTitle('Tắt tiếng cảnh báo')).toBeDefined(); // Still unmuted

    // 3. Switch to manual mode, focus input, and verify arrow keys do not change vehicle distance/offset
    fireEvent.click(screen.getByText('[3] Manual Live'));
    const distanceSpans = screen.getAllByText('38 m');
    expect(distanceSpans.length).toBeGreaterThan(0);

    youtubeInput.focus();
    fireEvent.keyDown(youtubeInput, { key: 'ArrowUp' });
    fireEvent.keyDown(youtubeInput, { key: 'ArrowDown' });
    fireEvent.keyDown(youtubeInput, { key: 'ArrowLeft' });
    fireEvent.keyDown(youtubeInput, { key: 'ArrowRight' });

    // Distance must still be 38 m, not changed by keystrokes inside input
    const distanceSpansAfter = screen.getAllByText('38 m');
    expect(distanceSpansAfter.length).toBeGreaterThan(0);
    expect(screen.getByText('0.00')).toBeDefined();
  });

  it('verifies that textarea elements also suppress hotkeys', () => {
    render(<App />);

    // Dynamically insert a textarea into the DOM to test general textarea form control isolation
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();

    // Keystrokes inside textarea
    fireEvent.keyDown(textarea, { key: 'h' });
    expect(screen.queryByText('DEMO DIRECTOR PANEL')).not.toBeNull();

    fireEvent.keyDown(textarea, { key: 'm' });
    expect(screen.getByTitle('Tắt tiếng cảnh báo')).toBeDefined();

    document.body.removeChild(textarea);
  });

  it('verifies that contenteditable elements suppress hotkeys when isContentEditable is true', () => {
    render(<App />);

    // Dynamically insert a contenteditable div into the DOM
    const editableDiv = document.createElement('div');
    editableDiv.contentEditable = 'true';
    // jsdom does not define isContentEditable on HTMLElement prototype; polyfill for jsdom environment:
    Object.defineProperty(editableDiv, 'isContentEditable', {
      value: true,
      configurable: true,
    });
    document.body.appendChild(editableDiv);
    editableDiv.focus();

    fireEvent.keyDown(editableDiv, { key: 'h' });
    expect(screen.queryByText('DEMO DIRECTOR PANEL')).not.toBeNull();

    fireEvent.keyDown(editableDiv, { key: 'm' });
    expect(screen.getByTitle('Tắt tiếng cảnh báo')).toBeDefined();

    document.body.removeChild(editableDiv);
  });

  it('verifies that keystrokes outside form controls trigger shortcuts normally', () => {
    render(<App />);

    // Director panel starts visible
    expect(screen.getByText('DEMO DIRECTOR PANEL')).toBeDefined();

    // Dispatch 'h' on window
    fireEvent.keyDown(window, { key: 'h' });
    expect(screen.queryByText('DEMO DIRECTOR PANEL')).toBeNull();
    expect(screen.getByText('DIRECTOR PANEL (Phím H)')).toBeDefined();

    // Dispatch 'h' on window again to restore
    fireEvent.keyDown(window, { key: 'h' });
    expect(screen.getByText('DEMO DIRECTOR PANEL')).toBeDefined();

    // Dispatch 'm' on window to mute
    fireEvent.keyDown(window, { key: 'm' });
    expect(screen.getByTitle('Bật âm thanh cảnh báo')).toBeDefined();

    // Dispatch 'm' on window again to unmute
    fireEvent.keyDown(window, { key: 'm' });
    expect(screen.getByTitle('Tắt tiếng cảnh báo')).toBeDefined();
  });
});
