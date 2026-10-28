import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from './supabaseClient';
import './App.css';

const STORAGE_KEY = 'hf-playground-conversations';
const ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';
const WHOAMI_ENDPOINT = 'https://huggingface.co/api/whoami-v2';
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
