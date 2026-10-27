jest.mock('openai', () => jest.fn());
jest.mock('openai/resources/responses/ws', () => ({ ResponsesWS: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const { EventEmitter } = require('events');
const OpenAI = require('openai');
const { ResponsesWS } = require('openai/resources/responses/ws');
const { createClient } = require('@supabase/supabase-js');
const diagnose = require('../api/diagnose');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    setHeader: jest.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('uses Responses WebSocket function tools to inspect logs and workspace code', async () => {
  const originalEnv = {
    apiKey: process.env.OPENAI_API_KEY,
    supabaseUrl: process.env.REACT_APP_SUPABASE_URL,
    supabaseKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
  };
  process.env.OPENAI_API_KEY = 'test-api-key';
  process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
  process.env.REACT_APP_SUPABASE_ANON_KEY = 'test-anon-key';

  const socket = new EventEmitter();
  const sentEvents = [];
  socket.close = jest.fn();
  socket.send = jest.fn((event) => {
    sentEvents.push(event);
    if (event.type !== 'response.create') return;

    process.nextTick(() => {
      if (!event.previous_response_id) {
        socket.emit('event', {
          type: 'response.completed',
          response: {
            id: 'response-1',
            output: [
              { type: 'function_call', name: 'testLogTool', call_id: 'logs-call', arguments: '{}' },
              { type: 'function_call', name: 'codeSearchTool', call_id: 'search-call', arguments: '{"query":"CI diagnosis"}' },
            ],
          },
        });
        return;
      }

      socket.emit('event', {
        type: 'response.completed',
        response: {
          id: 'response-2',
          output: [{
            type: 'message',
            content: [{ type: 'output_text', text: 'The test failure is caused by the dependency mismatch.' }],
          }],
        },
      });
    });
  });
  ResponsesWS.mockImplementation(() => socket);
  createClient.mockReturnValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
  });
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});

  try {
    const res = createResponse();
    await diagnose({
      method: 'POST',
      headers: { authorization: 'Bearer valid-session' },
      body: { logs: 'FAILED test_api.py::test_timeout\nTimeoutError: connect' },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.output_text).toBe('The test failure is caused by the dependency mismatch.');
    expect(sentEvents).toHaveLength(2);
    expect(sentEvents[0].store).toBe(false);
    expect(sentEvents[0].tools.map((tool) => tool.name)).toEqual(['testLogTool', 'codeSearchTool']);
    expect(sentEvents[1].previous_response_id).toBe('response-1');
    expect(sentEvents[1].input[0].output).toContain('FAILED test_api.py::test_timeout');
    expect(sentEvents[1].input[1].output).toContain('README.md');
    expect(log).toHaveBeenCalledWith('response.completed');
    expect(socket.close).toHaveBeenCalled();
    expect(OpenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
  } finally {
    log.mockRestore();
    error.mockRestore();
    if (originalEnv.apiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalEnv.apiKey;
    if (originalEnv.supabaseUrl === undefined) delete process.env.REACT_APP_SUPABASE_URL;
    else process.env.REACT_APP_SUPABASE_URL = originalEnv.supabaseUrl;
    if (originalEnv.supabaseKey === undefined) delete process.env.REACT_APP_SUPABASE_ANON_KEY;
    else process.env.REACT_APP_SUPABASE_ANON_KEY = originalEnv.supabaseKey;
  }
});
