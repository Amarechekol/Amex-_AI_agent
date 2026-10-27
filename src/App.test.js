import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

test('renders the chat playground and suggested prompts without the welcome headline', async () => {
  const { container } = render(<App />);

  expect(screen.queryByText(/ideas start somewhere/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/a little curiosity can go a long way/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/your ai, your way/i)).not.toBeInTheDocument();
  const sidebar = within(screen.getByRole('complementary'));
  expect(sidebar.getByRole('button', { name: /explain a concept/i })).toBeInTheDocument();
  expect(sidebar.getByRole('button', { name: /write some code/i })).toBeInTheDocument();
  expect(sidebar.getByRole('button', { name: /help me create/i })).toBeInTheDocument();
  expect(sidebar.getByRole('button', { name: /diagnose ci failure/i })).toBeInTheDocument();
  expect(container).not.toHaveTextContent(/Explain how neural networks learn/);
  expect(screen.getByRole('textbox', { name: /message/i })).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeEnabled();
});

test('sign-in button opens setup guidance when Supabase is not configured', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
  expect(screen.getByRole('alert')).toHaveTextContent(/REACT_APP_SUPABASE_URL/i);
});

test('selecting a sidebar prompt fills the composer', () => {
  render(<App />);

  fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /write some code/i }));

  expect(screen.getByRole('textbox', { name: /message/i })).toHaveValue(
    'Write a JavaScript function that removes duplicates from an array.',
  );
});

test('toggles dark and light mode and saves the preference', () => {
  const savedTheme = window.localStorage.getItem('w2r-theme');
  window.localStorage.setItem('w2r-theme', 'light');
  const { container } = render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));
  expect(container.querySelector('.app-shell')).toHaveClass('theme-dark');
  expect(window.localStorage.getItem('w2r-theme')).toBe('dark');

  fireEvent.click(screen.getByRole('button', { name: /switch to light mode/i }));
  expect(container.querySelector('.app-shell')).not.toHaveClass('theme-dark');
  expect(window.localStorage.getItem('w2r-theme')).toBe('light');

  if (savedTheme === null) {
    window.localStorage.removeItem('w2r-theme');
  } else {
    window.localStorage.setItem('w2r-theme', savedTheme);
  }
});

test('asks for a Hugging Face token before sending a prompt', () => {
  render(<App />);

  fireEvent.change(screen.getByRole('textbox', { name: /message/i }), {
    target: { value: 'Hello there' },
  });
  fireEvent.click(screen.getByRole('button', { name: /send message/i }));

  expect(screen.getByRole('alert')).toHaveTextContent(/add a hugging face access token/i);
});

test('requires sign-in before running the OpenAI diagnosis', () => {
  render(<App />);

  fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /diagnose ci failure/i }));
  fireEvent.change(screen.getByRole('textbox', { name: /message/i }), {
    target: { value: 'FAILED test_example.py::test_request' },
  });
  fireEvent.click(screen.getByRole('button', { name: /send message/i }));

  expect(screen.getByRole('alert')).toHaveTextContent(/configure supabase and sign in/i);
});

test('deletes a conversation from its options menu', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: /new chat/i }));

  fireEvent.click(screen.getByRole('button', { name: /more options for new conversation/i }));
  fireEvent.click(screen.getByRole('button', { name: /delete conversation/i }));

  expect(screen.queryByRole('button', { name: /new conversation/i })).not.toBeInTheDocument();
  expect(screen.getByText(/your conversations will appear here/i)).toBeInTheDocument();
});

test('verifies a token with Hugging Face before connecting', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /connect token/i }));
  fireEvent.change(screen.getByLabelText(/access token/i), {
    target: { value: 'hf_test_token' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    'https://huggingface.co/api/whoami-v2',
    { headers: { Authorization: 'Bearer hf_test_token' } },
  ));
  await waitFor(() => expect(screen.getByRole('button', { name: /^connected$/i })).toBeInTheDocument());
});

test('shows an error and stays disconnected when Hugging Face rejects a token', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401 });
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: /connect token/i }));
  fireEvent.change(screen.getByLabelText(/access token/i), {
    target: { value: 'hf_invalid_token' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/token was rejected/i);
  expect(screen.getByRole('button', { name: /connect token/i })).toBeInTheDocument();
});
