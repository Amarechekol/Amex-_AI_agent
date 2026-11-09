module.exports = async function chat(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Only POST requests are supported.' });
  }

  const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_TOKEN || process.env.REACT_APP_HF_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'The server is missing its Hugging Face token configuration.' });
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  if (!messages.length) {
    return res.status(400).json({ error: 'No chat messages were provided.' });
  }

  const requestBody = {
    model: payload.model || 'meta-llama/Llama-3.1-8B-Instruct',
    messages,
    temperature: payload.temperature ?? 0.7,
    max_tokens: payload.max_tokens ?? 1024,
    stream: false,
  };

  try {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = result?.error?.message || result?.error || `Hugging Face request failed with status ${response.status}.`;
      return res.status(response.status).json({ error: typeof detail === 'string' ? detail : JSON.stringify(detail) });
    }

    return res.status(200).json(result || {});
  } catch (error) {
    console.error('Hugging Face chat request failed:', error);
    return res.status(502).json({ error: error.message || 'The Hugging Face chat request failed.' });
  }
};
