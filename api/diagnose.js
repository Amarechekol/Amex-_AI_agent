const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { ResponsesWS } = require('openai/resources/responses/ws');
const { createClient } = require('@supabase/supabase-js');

const MODEL = 'gpt-6-astra';
const MAX_LOG_LENGTH = 50000;
const MAX_TOOL_CALLS = 6;
const MAX_SEARCH_FILES = 1200;
const MAX_SEARCH_OUTPUT = 10000;
const SOURCE_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cs', '.go', '.h', '.hpp', '.java', '.js', '.jsx', '.md', '.py', '.rb', '.rs', '.sh', '.sql', '.swift', '.ts', '.tsx', '.vue', '.yaml', '.yml']);
const IGNORED_DIRECTORIES = new Set(['.git', 'build', 'coverage', 'dist', 'node_modules', 'vendor', '.next', '.venv', 'venv', '__pycache__']);
const tools = [
  {
    type: 'function',
    name: 'testLogTool',
    description: 'Inspect the CI logs supplied by the user and return the failure lines with nearby context.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'codeSearchTool',
    description: 'Search source and documentation files in the current workspace for a literal string.',
    strict: true,
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A short literal code-search string.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
];

function inspectTestLogs(logs) {
  const lines = logs.split(/\r?\n/);
  const failurePattern = /\b(fail(?:ed|ure)?|error|exception|traceback|assert(?:ion)?|timeout|flaky|xfailed?)\b/i;
  const matchingIndices = [];
  lines.forEach((line, index) => {
    if (failurePattern.test(line)) matchingIndices.push(index);
  });

  const selected = new Set();
  const indices = matchingIndices.length ? matchingIndices : lines.map((_, index) => index).slice(0, 40);
  indices.forEach((index) => {
    for (let contextIndex = Math.max(0, index - 2); contextIndex <= Math.min(lines.length - 1, index + 3); contextIndex += 1) {
      selected.add(contextIndex);
    }
  });

  return [...selected]
    .sort((left, right) => left - right)
    .slice(0, 100)
    .map((index) => `${index + 1}: ${lines[index]}`)
    .join('\n');
}

function redactSecrets(text) {
  return text
    .replace(/((?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|hf_[A-Za-z0-9]{12,})\b/g, '[REDACTED]');
}

function searchWorkspace(query) {
  const root = path.resolve(__dirname, '..');
  const matches = [];
  let scannedFiles = 0;
  let outputLength = 0;
  const searchTerm = query.toLocaleLowerCase();

  function visit(directory) {
    if (scannedFiles >= MAX_SEARCH_FILES || outputLength >= MAX_SEARCH_OUTPUT) return;
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (scannedFiles >= MAX_SEARCH_FILES || outputLength >= MAX_SEARCH_OUTPUT) break;
      if (entry.name.startsWith('.') || IGNORED_DIRECTORIES.has(entry.name)) continue;

      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      scannedFiles += 1;
      if (fs.statSync(entryPath).size > 1000000) continue;
      const content = fs.readFileSync(entryPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].toLocaleLowerCase().includes(searchTerm)) continue;
        const relativePath = path.relative(root, entryPath).split(path.sep).join('/');
        const result = redactSecrets(`${relativePath}:${index + 1}: ${lines[index].slice(0, 300)}`);
        if (outputLength + result.length > MAX_SEARCH_OUTPUT) return;
        matches.push(result);
        outputLength += result.length;
      }
    }
  }

  visit(root);
  return matches.length
    ? matches.join('\n')
    : `No source or documentation matches found for "${query}". Searched ${scannedFiles} files.`;
}

function executeTool(name, args, logs) {
  if (name === 'testLogTool') {
    return inspectTestLogs(logs);
  }
  if (name === 'codeSearchTool') {
    if (typeof args.query !== 'string' || args.query.trim().length < 2 || args.query.length > 120) {
      throw new Error('codeSearchTool requires a search query between 2 and 120 characters.');
    }
    return searchWorkspace(args.query.trim());
  }
  throw new Error(`Unsupported tool requested: ${name}`);
}

function getResponseText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  return (response.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text)
    .join('');
}

function runResponsesWebSocket(logs) {
  return new Promise((resolve, reject) => {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ws = new ResponsesWS(openai);
    let finished = false;
    let toolCallCount = 0;
    const timeout = setTimeout(() => finish(new Error('OpenAI diagnosis timed out. Please retry.')), 55000);

    function finish(error, value) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      ws.close();
      if (error) reject(error);
      else resolve(value);
    }

    ws.on('event', (event) => {
      console.log(event.type);
      if (event.type === 'response.failed' || event.type === 'response.incomplete') {
        finish(new Error(event.response?.error?.message || event.response?.incomplete_details?.reason || 'OpenAI could not complete the diagnosis.'));
        return;
      }
      if (event.type !== 'response.completed' || finished) return;

      const response = event.response;
      const functionCalls = (response.output || []).filter((item) => item.type === 'function_call');
      if (!functionCalls.length) {
        const answer = getResponseText(response).trim();
        if (!answer) finish(new Error('OpenAI returned an empty response.'));
        else finish(null, answer);
        return;
      }

      toolCallCount += functionCalls.length;
      if (toolCallCount > MAX_TOOL_CALLS) {
        finish(new Error('The diagnosis exceeded the allowed number of tool calls.'));
        return;
      }

      try {
        const outputs = functionCalls.map((call) => {
          const args = JSON.parse(call.arguments || '{}');
          const output = executeTool(call.name, args, logs);
          return { type: 'function_call_output', call_id: call.call_id, output };
        });
        ws.send({
          type: 'response.create',
          model: MODEL,
          store: false,
          previous_response_id: response.id,
          input: outputs,
          tools,
        });
      } catch (error) {
        finish(error);
      }
    });

    ws.on('error', (error) => {
      console.error('OpenAI Responses WebSocket error:', error);
      finish(error);
    });

    ws.send({
      type: 'response.create',
      model: MODEL,
      store: false,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Find the flaky test in this CI run. Use testLogTool to inspect the supplied logs and codeSearchTool to investigate relevant workspace code. Keep going until you can explain the root cause and the smallest safe fix.',
                '',
                'CI test run logs:',
                logs,
              ].join('\n'),
            },
          ],
        },
      ],
      tools,
    });
  });
}

module.exports = async function diagnose(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Only POST requests are supported.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'The server is missing its OPENAI_API_KEY configuration.' });
  }

  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
  const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(503).json({ error: 'The server is missing its Supabase authentication configuration.' });
  }

  const logs = req.body?.logs;
  if (typeof logs !== 'string' || !logs.trim()) {
    return res.status(400).json({ error: 'Paste the CI test run logs before starting the diagnosis.' });
  }
  if (logs.length > MAX_LOG_LENGTH) {
    return res.status(413).json({ error: `CI logs must be no longer than ${MAX_LOG_LENGTH} characters.` });
  }

  const authorization = req.headers.authorization || '';
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return res.status(401).json({ error: 'Sign in before running the OpenAI diagnosis.' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let authResult;
  try {
    authResult = await supabase.auth.getUser(accessToken);
  } catch (error) {
    console.error('Supabase token verification failed:', error);
    return res.status(502).json({ error: 'Could not verify your sign-in. Please try again.' });
  }
  if (authResult.error || !authResult.data.user) {
    return res.status(401).json({ error: 'Your sign-in has expired. Sign in again and retry.' });
  }

  try {
    const outputText = await runResponsesWebSocket(logs);
    return res.status(200).json({ output_text: outputText });
  } catch (error) {
    console.error('OpenAI diagnosis request failed:', error);
    return res.status(502).json({
      error: error.message || 'The OpenAI diagnosis request failed.',
    });
  }
};
