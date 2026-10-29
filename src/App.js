import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from './supabaseClient';
import './App.css';

const STORAGE_KEY = 'hf-playground-conversations';
const ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const WHOAMI_ENDPOINT = 'https://huggingface.co/api/whoami-v2';
const LOGO_SRC = `${process.env.PUBLIC_URL}/amex-ai-logo.png`;
const MODELS = [
  { id: 'meta-llama/Llama-3.1-8B-Instruct', name: 'Llama 3.1', detail: 'A capable all-rounder' },
  { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen 2.5', detail: 'Fast and versatile' },
  { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B', detail: 'Concise and capable' },
];
const SUGGESTIONS = [
  { icon: '✦', title: 'Explain a concept', prompt: 'Explain how neural networks learn, using a simple analogy.' },
  { icon: '⌘', title: 'Write some code', prompt: 'Write a JavaScript function that removes duplicates from an array.' },
  { icon: '↗', title: 'Help me create', prompt: 'Give me five creative ideas for a low-key weekend.' },
  { icon: '✦', title: 'Diagnose CI failure', action: 'openai' },
];

function Icon({ name, size = 18 }) {
  const shared = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    plus: <><path d="M12 5v14M5 12h14" /></>,
    message: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.7Z" transform="translate(-2 -2)" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    sparkle: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1 2.5 2 1-2 1L19 21l-1-2.5-2-1 2-1 1-2.5Z" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    chevron: <><path d="m7 10 5 5 5-5" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    moon: <><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></>,
  };
  return <svg {...shared}>{paths[name]}</svg>;
}

function makeChat() {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: 'New conversation', messages: [], updatedAt: Date.now() };
}

function loadChats() {
  let serialized;
  try {
    serialized = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { chats: [], error: 'Saved conversations are unavailable in this browser.' };
  }
  if (!serialized) return { chats: [], error: '' };
  try {
    const saved = JSON.parse(serialized);
    const valid = Array.isArray(saved) && saved.every((chat) =>
      chat &&
      typeof chat.id === 'string' &&
      typeof chat.title === 'string' &&
      typeof chat.updatedAt === 'number' &&
      Array.isArray(chat.messages) &&
      chat.messages.every((message) =>
        message &&
        typeof message.id === 'string' &&
        ['user', 'assistant'].includes(message.role) &&
        typeof message.content === 'string'));
    return valid
      ? { chats: saved, error: '' }
      : { chats: [], error: 'Saved conversations were invalid and could not be loaded.' };
  } catch {
    return { chats: [], error: 'Saved conversations were invalid and could not be loaded.' };
  }
}

function App() {
  const [initialData] = useState(loadChats);
  const [chats, setChats] = useState(initialData.chats);
  const [activeId, setActiveId] = useState(initialData.chats[0]?.id || null);
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return window.localStorage.getItem('w2r-theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [token, setToken] = useState('');
  const [tokenDraft, setTokenDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('sign-in');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(supabaseConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [modelOpen, setModelOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatMenuId, setChatMenuId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [diagnoseMode, setDiagnoseMode] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [error, setError] = useState(initialData.error);
  const endRef = useRef(null);
  const textareaRef = useRef(null);
  const activeChat = chats.find((chat) => chat.id === activeId);
  const activeModel = MODELS.find((model) => model.id === modelId) || MODELS[0];

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
    } catch {
      setError('Conversation history could not be saved in this browser.');
    }
  }, [chats]);

  useEffect(() => {
    try {
      window.localStorage.setItem('w2r-theme', darkMode ? 'dark' : 'light');
    } catch {
      setError('Your appearance preference could not be saved in this browser.');
    }
  }, [darkMode]);

  useEffect(() => {
    if (!supabase) return undefined;

    let isMounted = true;
    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!isMounted) return;
        if (sessionError) {
          setAuthError(sessionError.message);
        } else {
          setAuthUser(data.session?.user || null);
        }
      })
      .catch((sessionError) => {
        if (isMounted) setAuthError(sessionError.message || 'Could not restore your sign-in session.');
      })
      .finally(() => {
        if (isMounted) setAuthLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) setAuthUser(session?.user || null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeChat?.messages, sending]);

  const startNewChat = useCallback(() => {
    const chat = makeChat();
    setChats((current) => [chat, ...current]);
    setActiveId(chat.id);
    setDraft('');
    setDiagnoseMode(false);
    setError('');
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }, []);

  function deleteChat(chatId) {
    const orderedChats = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
    const remainingChats = orderedChats.filter((chat) => chat.id !== chatId);
    setChats(remainingChats);
    if (activeId === chatId) {
      setActiveId(remainingChats[0]?.id || null);
      setDraft('');
      setError('');
    }
    setChatMenuId(null);
  }

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        startNewChat();
      }
      if (event.key === 'Escape') {
        setSettingsOpen(false);
        setAuthOpen(false);
        setModelOpen(false);
        setSidebarOpen(false);
        setChatMenuId(null);
      }
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [startNewChat]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    if (!supabase || authBusy) return;

    setAuthBusy(true);
    setAuthError('');
    setAuthMessage('');
    try {
      const result = authMode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword })
        : await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { emailRedirectTo: window.location.origin },
        });

      if (result.error) throw result.error;

      if (authMode === 'sign-up' && !result.data.session) {
        setAuthMessage('Account created. Check your email to confirm your address, then sign in.');
        return;
      }

      setAuthUser(result.data.user || result.data.session?.user || null);
      setAuthOpen(false);
      setAuthPassword('');
    } catch (requestError) {
      setAuthError(requestError.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (!supabase || authBusy) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setAuthUser(null);
      setAuthPassword('');
    } catch (requestError) {
      setAuthError(requestError.message || 'Could not sign out. Please try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveToken(event) {
    event.preventDefault();
    const submittedToken = tokenDraft.trim();
    if (!submittedToken || connecting) return;

    setConnecting(true);
    setConnectionError('');
    try {
      const response = await fetch(WHOAMI_ENDPOINT, {
        headers: { Authorization: `Bearer ${submittedToken}` },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error('This token was rejected. Check it and try again.');
        }
        throw new Error(`Hugging Face could not verify this token (HTTP ${response.status}). Try again.`);
      }
      setToken(submittedToken);
      setSettingsOpen(false);
      setError('');
    } catch (requestError) {
      setConnectionError(requestError.message || 'Could not connect to Hugging Face. Check your connection and try again.');
    } finally {
      setConnecting(false);
    }
  }

  async function sendMessage(text = draft) {
    const content = text.trim();
    if (!content || sending) return;
    if (diagnoseMode) {
      await runCiDiagnosis(content);
      return;
    }
    if (!token) {
      setError('Add a Hugging Face access token in Settings to start chatting.');
      return;
    }

    const chatId = activeId || makeChat().id;
    const userMessage = { role: 'user', content, id: `${Date.now()}-user` };
    const chatBeforeSend = chats.find((chat) => chat.id === chatId);
    const nextMessages = [...(chatBeforeSend?.messages || []), userMessage];
    const title = chatBeforeSend?.messages?.length ? chatBeforeSend.title : content.slice(0, 44) + (content.length > 44 ? '…' : '');
    setChats((current) => {
      const existing = current.find((chat) => chat.id === chatId);
      if (existing) {
        return current.map((chat) => chat.id === chatId ? { ...chat, title, messages: nextMessages, updatedAt: Date.now() } : chat);
      }
      return [{ id: chatId, title, messages: nextMessages, updatedAt: Date.now() }, ...current];
    });
    setActiveId(chatId);
    setDraft('');
    setError('');
    setSending(true);

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: 'You are a helpful, clear, and thoughtful AI assistant.' },
            ...nextMessages.map(({ role, content: messageContent }) => ({ role, content: messageContent })),
          ],
          temperature: 0.7,
          max_tokens: 1024,
          stream: false,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = result?.error?.message || result?.error || `Request failed with status ${response.status}.`;
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }
      const answer = result?.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim()) {
        throw new Error('The model returned an empty response. Try again or choose another model.');
      }
      setChats((current) => current.map((chat) => chat.id === chatId
        ? { ...chat, messages: [...chat.messages, { role: 'assistant', content: answer.trim(), id: `${Date.now()}-assistant` }], updatedAt: Date.now() }
        : chat));
    } catch (requestError) {
      setError(requestError.message || 'The request failed. Check your connection and Hugging Face token.');
    } finally {
      setSending(false);
    }
  }

  async function runCiDiagnosis(logs) {
    if (sending) return;
    if (!logs.trim()) {
      setError('Paste the CI test run logs before starting the diagnosis.');
      return;
    }
    if (!supabase || !supabaseConfigured) {
      setError('Configure Supabase and sign in before running the OpenAI diagnosis.');
      return;
    }

    setError('');
    setSending(true);
    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error('Sign in before running the OpenAI diagnosis.');
      }

      const chat = makeChat();
      const userMessage = { role: 'user', content: logs, id: `${Date.now()}-user` };
      const title = 'CI test run analysis';
      setChats((current) => [{ ...chat, title, messages: [userMessage] }, ...current]);
      setActiveId(chat.id);
      setSidebarOpen(false);
      setDraft('');
      setDiagnoseMode(false);
      setSending(true);
      setDiagnosing(true);

      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = result?.error || `Request failed with status ${response.status}.`;
        throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }
      if (typeof result?.output_text !== 'string' || !result.output_text.trim()) {
        throw new Error('OpenAI returned an empty response. Try again.');
      }

      setChats((current) => current.map((item) => item.id === chat.id
        ? { ...item, messages: [...item.messages, { role: 'assistant', content: result.output_text.trim(), provider: 'OpenAI', id: `${Date.now()}-assistant` }], updatedAt: Date.now() }
        : item));
    } catch (requestError) {
      setError(requestError.message || 'The OpenAI diagnosis request failed.');
    } finally {
      setSending(false);
      setDiagnosing(false);
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <main className={`app-shell${darkMode ? ' theme-dark' : ''}`}>
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <a className="brand" href="/" aria-label="WISDOM-TO-REACH home">
            <img className="brand-mark" src={LOGO_SRC} alt="WISDOM-TO-REACH logo" />
            <span className="brand-name">WISDOM-TO-REACH</span>
          </a>
          <button className="icon-button sidebar-close" aria-label="Close sidebar" onClick={() => setSidebarOpen(false)}><Icon name="close" /></button>
        </div>
        <button className="new-chat-button" onClick={startNewChat}>
          <Icon name="plus" size={17} /><span>New chat</span><kbd>⌘ K</kbd>
        </button>
        <div className="quick-prompts" aria-label="Prompt suggestions">
          <p className="section-label">TRY A PROMPT</p>
          {SUGGESTIONS.map((suggestion) => (
            <button
              className="quick-prompt"
              key={suggestion.title}
              onClick={() => {
                if (suggestion.action === 'openai') {
                  setDiagnoseMode(true);
                  setDraft('');
                  setSidebarOpen(false);
                  textareaRef.current?.focus();
                  return;
                }
                setDraft(suggestion.prompt);
                setSidebarOpen(false);
                textareaRef.current?.focus();
              }}
              disabled={sending}
            >
              <span className="quick-prompt-icon">{suggestion.icon}</span>
              <span>{suggestion.title}</span>
            </button>
          ))}
        </div>
        <div className="history-section">
          <p className="section-label">YOUR CHATS</p>
          {chats.length ? (
            <div className="chat-list">
              {[...chats].sort((a, b) => b.updatedAt - a.updatedAt).map((chat) => (
                <div key={chat.id} className={`history-row ${activeId === chat.id ? 'history-row-active' : ''}`}>
                  <button className="history-item" onClick={() => { setActiveId(chat.id); setError(''); setChatMenuId(null); setSidebarOpen(false); }}>
                    <Icon name="message" size={15} /><span className="history-title">{chat.title}</span>
                  </button>
                  <button
                    className="history-menu-trigger"
                    aria-label={`More options for ${chat.title}`}
                    aria-expanded={chatMenuId === chat.id}
                    onClick={() => setChatMenuId((currentId) => currentId === chat.id ? null : chat.id)}
                  >
                    <Icon name="more" size={16} />
                  </button>
                  {chatMenuId === chat.id && (
                    <div className="history-menu">
                      <button className="history-delete-action" onClick={() => deleteChat(chat.id)}>
                        <Icon name="trash" size={14} /><span>Delete conversation</span>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="history-empty">Your conversations will appear here.</p>
          )}
        </div>
        <div className="sidebar-footer">
          <div className="connection-note"><span className={`connection-dot ${token ? 'connected' : ''}`} /><span>{token ? 'Token ready' : 'Not connected'}</span></div>
          <button className="settings-button" onClick={() => { setTokenDraft(token); setSettingsOpen(true); }}>
            <span className="avatar">Y</span><span className="settings-label"><strong>Your workspace</strong><small>{token ? 'Hugging Face connected' : 'Set up your access token'}</small></span>
            <Icon name="settings" size={17} />
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button menu-button" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><Icon name="menu" /></button>
            <div className="model-picker-wrap">
              <button className={`model-picker ${modelOpen ? 'model-picker-open' : ''}`} onClick={() => setModelOpen((open) => !open)} aria-expanded={modelOpen}>
                <span className="model-indicator" /><span className="model-name">{activeModel.name}</span><Icon name="chevron" size={15} />
              </button>
              {modelOpen && (
                <>
                  <button className="menu-dismiss" aria-label="Close model menu" onClick={() => setModelOpen(false)} />
                  <div className="model-menu">
                    <p className="menu-heading">SELECT A MODEL</p>
                    {MODELS.map((model) => (
                      <button key={model.id} className="model-option" onClick={() => { setModelId(model.id); setModelOpen(false); }}>
                        <span className="model-option-dot" />
                        <span className="model-option-copy"><strong>{model.name}</strong><small>{model.detail}</small></span>
                        {model.id === modelId && <Icon name="check" size={16} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="topbar-actions">
            {authUser ? (
              <button className="sign-in-button" type="button" onClick={handleSignOut} disabled={authBusy || authLoading}>
                {authBusy ? 'Signing out…' : 'Sign out'}
              </button>
            ) : (
              <button
                className="sign-in-button"
                type="button"
                onClick={() => { setAuthOpen(true); setAuthError(''); setAuthMessage(''); }}
                disabled={authLoading}
              >
                {authLoading ? 'Loading…' : 'Sign in'}
              </button>
            )}
            <button className={`top-connect ${token ? 'top-connect-ready' : ''}`} onClick={() => { setTokenDraft(token); setSettingsOpen(true); }}>
              <Icon name={token ? 'check' : 'lock'} size={15} /><span>{token ? 'Connected' : 'Connect token'}</span>
            </button>
            <button
              className="theme-toggle"
              type="button"
              aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
              title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}
              aria-pressed={darkMode}
              onClick={() => setDarkMode((current) => !current)}
            >
              <Icon name={darkMode ? 'sun' : 'moon'} size={17} />
              <span>{darkMode ? 'Light' : 'Dark'}</span>
            </button>
          </div>
        </header>

        <div className={`conversation ${activeChat?.messages?.length ? 'conversation-has-messages' : ''}`}>
          {activeChat?.messages?.length ? (
            <div className="messages">
              {activeChat.messages.map((message) => (
                <article key={message.id} className={`message message-${message.role}`}>
                  {message.role === 'assistant' ? <div className="assistant-avatar"><img className="brand-mark" src={LOGO_SRC} alt="" /></div> : <div className="user-avatar">Y</div>}
                  <div className="message-body">
                    <div className="message-author">{message.role === 'assistant' ? message.provider || 'Hugging Face' : 'You'}</div>
                    <div className="message-content">{message.content}</div>
                  </div>
                </article>
              ))}
              {sending && <article className="message message-assistant"><div className="assistant-avatar"><img className="brand-mark" src={LOGO_SRC} alt="" /></div><div className="message-body"><div className="message-author">{diagnosing ? 'OpenAI' : 'Hugging Face'}</div><div className="thinking"><i /><i /><i /></div></div></article>}
              <div ref={endRef} />
            </div>
          ) : (
            <div className="welcome" />
          )}
        </div>

        <div className="composer-area">
          {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><Icon name="close" size={15} /></button></div>}
          <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={diagnoseMode ? 'Paste the CI test run logs here…' : 'Ask anything…'}
              aria-label="Message"
              rows={1}
            />
            <div className="composer-bottom">
              <div className="composer-hint">
                {diagnoseMode ? (
                  <><span>CI analysis</span><span className="hint-divider">·</span><span>Remove secrets before sending logs to OpenAI.</span></>
                ) : (
                  <><span className="hint-sparkle"><Icon name="sparkle" size={13} /></span><span>{activeModel.name}</span><span className="hint-divider">·</span><span>Shift + Enter for a new line</span></>
                )}
              </div>
              <button className="send-button" type="submit" disabled={!draft.trim() || sending} aria-label="Send message"><Icon name="send" size={17} /></button>
            </div>
          </form>
          <p className="disclaimer">Models can make mistakes. Check important information.</p>
        </div>
      </section>

      {authOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}>
          <section className="settings-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="modal-close icon-button" aria-label="Close sign-in" onClick={() => setAuthOpen(false)}><Icon name="close" /></button>
            <div className="modal-icon"><Icon name="lock" size={20} /></div>
            <p className="modal-eyebrow">WISDOM-TO-REACH ACCOUNT</p>
            <h2 id="auth-title">{authMode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="modal-description">
              {supabaseConfigured
                ? authMode === 'sign-in' ? 'Sign in with your email and password.' : 'Create an account using your email address.'
                : 'Authentication needs Supabase project settings before it can be used.'}
            </p>
            {!supabaseConfigured ? (
              <div className="auth-setup-message" role="alert">
                Configure <code>REACT_APP_SUPABASE_URL</code> and <code>REACT_APP_SUPABASE_ANON_KEY</code> in your environment, then restart or redeploy the app.
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit}>
                <label className="token-label" htmlFor="auth-email">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={authEmail}
                  onChange={(event) => { setAuthEmail(event.target.value); setAuthError(''); }}
                  placeholder="you@example.com"
                />
                <label className="token-label auth-password-label" htmlFor="auth-password">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                  minLength={6}
                  required
                  value={authPassword}
                  onChange={(event) => { setAuthPassword(event.target.value); setAuthError(''); }}
                  placeholder="At least 6 characters"
                />
                {authError && <p className="connection-error" role="alert">{authError}</p>}
                {authMessage && <p className="auth-success" role="status">{authMessage}</p>}
                <button className="auth-mode-toggle" type="button" onClick={() => {
                  setAuthMode((mode) => mode === 'sign-in' ? 'sign-up' : 'sign-in');
                  setAuthError('');
                  setAuthMessage('');
                }}>
                  {authMode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
                </button>
                <div className="modal-actions">
                  <button className="save-token-button" type="submit" disabled={authBusy}>
                    {authBusy ? 'Please wait…' : authMode === 'sign-in' ? 'Sign in' : 'Create account'}
                  </button>
                </div>
              </form>
            )}
            <div className="privacy-note"><Icon name="lock" size={13} /><span>{supabaseConfigured ? 'Your account is authenticated securely by Supabase.' : 'Authentication starts after the Supabase project settings are configured.'}</span></div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <button className="modal-close icon-button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}><Icon name="close" /></button>
            <div className="modal-icon"><Icon name="lock" size={20} /></div>
            <p className="modal-eyebrow">ONE-TIME SETUP</p>
            <h2 id="settings-title">Connect Hugging Face</h2>
            <p className="modal-description">Add an access token to send prompts to the Inference API. Your token stays in this tab and is never saved to conversation history.</p>
            <form onSubmit={saveToken}>
              <label className="token-label" htmlFor="hf-token">Access token</label>
              <input id="hf-token" type="password" autoComplete="off" placeholder="hf_••••••••••••••••••••••••" value={tokenDraft} onChange={(event) => { setTokenDraft(event.target.value); setConnectionError(''); }} />
              {connectionError && <p className="connection-error" role="alert">{connectionError}</p>}
              <a className="token-link" href="https://huggingface.co/settings/tokens" target="_blank" rel="noreferrer">Create a token on Hugging Face <Icon name="arrow" size={13} /></a>
              <div className="modal-actions">
                {token && <button className="disconnect-button" type="button" onClick={() => { setToken(''); setTokenDraft(''); setSettingsOpen(false); }}>Disconnect</button>}
                <button className="save-token-button" type="submit" disabled={!tokenDraft.trim() || connecting}>{connecting ? 'Connecting…' : token ? 'Save token' : 'Connect'}{!connecting && <Icon name="arrow" size={15} />}</button>
              </div>
            </form>
            <div className="privacy-note"><Icon name="lock" size={13} /><span>Your token is only held in memory until you close or reload this tab.</span></div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
