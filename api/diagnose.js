const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { ResponsesWS } = require('openai/resources/responses/ws');
const { createClient } = require('@supabase/supabase-js');

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_LOG_LENGTH = 50000;
const MAX_TOOL_CALLS = 6;
const MAX_SEARCH_FILES = 1200;
const MAX_SEARCH_OUTPUT = 10000;
const SOURCE_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cs', '.go', '.h', '.hpp', '.java', '.js', '.jsx', '.md', '.py', '.rb', '.rs', '.sh', '.sql', '.swift', '.ts', '.tsx', '.vue', '.yaml', '.yml', '.json', '.toml', '.ini', '.cfg', '.xml', '.txt']);
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
