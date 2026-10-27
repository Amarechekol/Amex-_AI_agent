jest.mock('./supabaseClient', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

const { fireEvent, render, screen, waitFor, within } = require('@testing-library/react');
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
});

afterEach(() => {
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
  const dialog = screen.getByRole('dialog', { name: /welcome back/i });
  fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: user.email } });
  fireEvent.change(within(dialog).getByLabelText(/password/i), { target: { value: 'correct-horse' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /^sign in$/i }));

  await waitFor(() => expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
    email: user.email,
    password: 'correct-horse',
  }));
  expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('creates an account and gives email confirmation guidance', async () => {
  supabase.auth.signUp.mockResolvedValue({
    data: { user: { id: 'user-2', email: 'new@example.com' }, session: null },
    error: null,
  });
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
  const dialog = screen.getByRole('dialog', { name: /welcome back/i });
  fireEvent.click(within(dialog).getByRole('button', { name: /create an account/i }));
  fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'new@example.com' } });
  fireEvent.change(within(dialog).getByLabelText(/password/i), { target: { value: 'new-password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /create account/i }));

  expect(await within(dialog).findByRole('status')).toHaveTextContent(/check your email/i);
  expect(supabase.auth.signUp).toHaveBeenCalledWith({
    email: 'new@example.com',
    password: 'new-password',
    options: { emailRedirectTo: window.location.origin },
  });
});

test('reports sign-in failures in the dialog', async () => {
  supabase.auth.signInWithPassword.mockResolvedValue({
    data: { user: null, session: null },
    error: new Error('Invalid login credentials'),
  });
  render(<App />);

  fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }));
  const dialog = screen.getByRole('dialog', { name: /welcome back/i });
  fireEvent.change(within(dialog).getByLabelText(/email/i), { target: { value: 'person@example.com' } });
  fireEvent.change(within(dialog).getByLabelText(/password/i), { target: { value: 'wrong-password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: /^sign in$/i }));

  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/invalid login credentials/i);
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
