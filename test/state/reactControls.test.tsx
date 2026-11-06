// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Confirm, Password, Select } from '../../src/shared/ui/controls';
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
