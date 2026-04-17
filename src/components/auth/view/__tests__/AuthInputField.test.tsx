import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import AuthInputField from '../AuthInputField';

const defaultProps = {
  id: 'username',
  label: 'Username',
  value: '',
  onChange: vi.fn(),
  placeholder: 'Enter username',
  isDisabled: false,
};

describe('AuthInputField', () => {
  it('renders label and input', () => {
    render(<AuthInputField {...defaultProps} />);
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
  });

  it('calls onChange when user types', async () => {
    const onChange = vi.fn();
    render(<AuthInputField {...defaultProps} onChange={onChange} />);
    const input = screen.getByLabelText('Username');
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('renders password input when type is password', () => {
    render(<AuthInputField {...defaultProps} type="password" />);
    expect(screen.getByLabelText('Username')).toHaveAttribute('type', 'password');
  });

  it('disables input when isDisabled is true', () => {
    render(<AuthInputField {...defaultProps} isDisabled />);
    expect(screen.getByLabelText('Username')).toBeDisabled();
  });
});
