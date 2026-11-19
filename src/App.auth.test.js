jest.mock('./supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      signInWithOAuth: jest.fn(),
    },
  },
}));

const { act, fireEvent, render, screen, waitFor, within } = require('@testing-library/react');
const App = require('./App').default;
const { supabase } = require('./supabaseClient');
const originalFetch = global.fetch;
const originalScrollIntoView = Element.prototype.scrollIntoView;

beforeEach(() => {
  Element.prototype.scrollIntoView = jest.fn();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  supabase.auth.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: jest.fn() } },
  });
  supabase.auth.signInWithPassword.mockReset();
  supabase.auth.signUp.mockReset();
  supabase.auth.signOut.mockReset();
  supabase.auth.signInWithOAuth.mockReset();
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
  global.fetch = originalFetch;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

test('signs in with Supabase and switches to the signed-in state', async () => {
  const user = { id: 'user-1', email: 'person@example.com' };
  supabase.auth.signInWithPassword.mockResolvedValue({
    data: { user, session: { user } },
    error: null,
  });
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
  const authPage = within(screen.getByRole('main', { name: /account access/i }));
  fireEvent.change(authPage.getByLabelText(/email/i), { target: { value: user.email } });
  fireEvent.change(authPage.getByLabelText(/password/i), { target: { value: 'correct-horse' } });
  fireEvent.click(authPage.getByRole('button', { name: /^continue$/i }));

  await waitFor(() => expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
    email: user.email,
    password: 'correct-horse',
  }));
  expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument();
  expect(screen.queryByRole('main', { name: /account access/i })).not.toBeInTheDocument();
});

test('creates an account and gives email confirmation guidance', async () => {
  supabase.auth.signUp.mockResolvedValue({
    data: { user: { id: 'user-2', email: 'new@example.com' }, session: null },
    error: null,
  });
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
  const authPage = within(screen.getByRole('main', { name: /account access/i }));
  fireEvent.click(authPage.getByRole('button', { name: /sign up/i }));
  fireEvent.change(authPage.getByLabelText(/email/i), { target: { value: 'new@example.com' } });
  fireEvent.change(authPage.getByLabelText(/password/i), { target: { value: 'new-password' } });
  fireEvent.click(authPage.getByRole('button', { name: /create account/i }));

  expect(await authPage.findByRole('status')).toHaveTextContent(/check your email/i);
  expect(supabase.auth.signUp).toHaveBeenCalledWith({
    email: 'new@example.com',
    password: 'new-password',
    options: { emailRedirectTo: window.location.origin },
  });
});

test('reports sign-in failures on the login page', async () => {
  supabase.auth.signInWithPassword.mockResolvedValue({
    data: { user: null, session: null },
    error: new Error('Invalid login credentials'),
  });
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
  const authPage = within(screen.getByRole('main', { name: /account access/i }));
  fireEvent.change(authPage.getByLabelText(/email/i), { target: { value: 'person@example.com' } });
  fireEvent.change(authPage.getByLabelText(/password/i), { target: { value: 'wrong-password' } });
  fireEvent.click(authPage.getByRole('button', { name: /^continue$/i }));

  expect(await authPage.findByRole('alert')).toHaveTextContent(/invalid login credentials/i);
});

test('starts Microsoft sign-in through Supabase OAuth from the login page', async () => {
  supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: 'https://provider.example' }, error: null });
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
  fireEvent.click(screen.getByRole('button', { name: /continue with microsoft/i }));

  await waitFor(() => expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
    provider: 'azure',
    options: { redirectTo: window.location.origin, scopes: 'email' },
  }));
});

test('opens the dedicated signup route directly and switches back to login', async () => {
  window.history.replaceState({}, '', '/auth/signup');
  render(<App />);

  expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

  expect(window.location.pathname).toBe('/auth/login');
  expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
});

test('restores an existing session and can sign out', async () => {
  const user = { id: 'user-3', email: 'returning@example.com' };
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user } },
    error: null,
  });
  supabase.auth.signOut.mockResolvedValue({ error: null });
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /sign out/i }));

  await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalled());
  expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
});

test('runs the OpenAI CI diagnosis with the signed-in Supabase session', async () => {
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'session-token', user: { id: 'user-4' } } },
    error: null,
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ output_text: 'The smallest safe fix is to pin the compatible dependency.' }),
  });
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /diagnose ci failure/i }));
  fireEvent.change(screen.getByRole('textbox', { name: /message/i }), {
    target: { value: 'FAILED test_example.py::test_request' },
  });
  fireEvent.click(screen.getByRole('button', { name: /send message/i }));

  expect(await screen.findByText(/the smallest safe fix is to pin the compatible dependency/i)).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/diagnose', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
    body: JSON.stringify({ logs: 'FAILED test_example.py::test_request' }),
  }));
  expect(screen.getByText('OpenAI')).toBeInTheDocument();
});
