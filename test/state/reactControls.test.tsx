// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import { Confirm, Logo, Password, Select } from '../../src/shared/ui/controls';
afterEach(cleanup);
test('Escape cancels destructive confirmation without accepting and does not take initial focus', () => {
  const cancel = vi.fn(),
    accept = vi.fn();
  render(<Confirm title="Delete vault" onCancel={cancel} onConfirm={accept} />);
  expect(document.activeElement).toBe(document.body);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(cancel).toHaveBeenCalledOnce();
  expect(accept).not.toHaveBeenCalled();
});
test('password reveal preserves the controlled secret and labels its action', () => {
  const change = vi.fn();
  render(<Password label="Secret" value="sensitive" onChange={change} />);
  const input = screen.getByLabelText('Secret') as HTMLInputElement;
  expect(input.type).toBe('password');
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(input.type).toBe('text');
  expect(input.value).toBe('sensitive');
  fireEvent.change(input, { target: { value: 'edited' } });
  expect(change).toHaveBeenCalledWith('edited');
});
test('dropdown Escape closes without selecting an option', () => {
  const change = vi.fn();
  render(
    <Select
      label="Theme"
      value="light"
      options={[
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' }
      ]}
      onChange={change}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
  expect(screen.getByRole('button', { name: 'Dark' })).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'Dark' })).toBeNull();
  expect(change).not.toHaveBeenCalled();
});

test('logo stays complete without codes and stops its timer when countdown is disabled', async () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date('2026-11-07T00:00:10Z'));
    const { container, rerender } = render(<Logo />);
    const ring = () =>
      Array.from(container.querySelectorAll('circle[stroke-dasharray]')).map(
        (circle) => circle.getAttribute('stroke-dasharray')
      );
    expect(ring()).toEqual(Array(4).fill('31.17 135.09'));
    expect(vi.getTimerCount()).toBe(0);
    rerender(<Logo countdown />);
    expect(vi.getTimerCount()).toBe(1);
    const before = ring();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(ring()).not.toEqual(before);
    rerender(<Logo countdown={false} />);
    expect(ring()).toEqual(Array(4).fill('31.17 135.09'));
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

test('auto-lock menu survives body scroll and resize while allowing selection', () => {
  const change = vi.fn();
  const { container } = render(
    <main className="p-body">
      <Select
        label="Auto lock"
        value="5"
        options={[
          { value: '5', label: '5 minutes' },
          { value: '30', label: '30 minutes' }
        ]}
        onChange={change}
      />
    </main>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Auto lock' }));
  fireEvent.scroll(container.querySelector('.p-body')!);
  fireEvent.resize(window);
  expect(
    screen
      .getByRole('button', { name: 'Auto lock' })
      .getAttribute('aria-expanded')
  ).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: '30 minutes' }));
  expect(change).toHaveBeenCalledWith('30');
});
