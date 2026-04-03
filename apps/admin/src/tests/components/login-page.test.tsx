/**
 * STORY-UI1: Portal login / dashboard load.
 * Tests the login form, error handling, and auth redirect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth-context';
import { LoginPage } from '@/pages/LoginPage';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('STORY-UI1: Login Page', () => {
  beforeEach(() => {
    // Mock auth/me to return unauthenticated (not logged in)
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } }),
    });
  });

  it('renders the login form', async () => {
    renderLogin();

    // Wait for auth check to complete
    await waitFor(() => {
      expect(screen.getByText('NexClaw Admin')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows error for invalid login', async () => {
    renderLogin();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    // Mock login failure
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }),
    });

    await user.type(screen.getByLabelText('Email'), 'wrong@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument();
    });
  });

  it('disables form fields during submission', async () => {
    renderLogin();
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeInTheDocument();
    });

    // Mock slow login
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({
        ok: true,
        status: 200,
        json: async () => ({ data: { user: { id: '1', email: 'a@b.com', role: 'admin', displayName: 'Admin' } } }),
      }), 500)),
    );

    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.type(screen.getByLabelText('Password'), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    // Button shows "Signing in..." during submission
    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
  });

  it('email and password fields are required', async () => {
    renderLogin();

    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeRequired();
      expect(screen.getByLabelText('Password')).toBeRequired();
    });
  });
});
