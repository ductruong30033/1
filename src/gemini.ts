// src/gemini.ts - Client side helpers using our backend proxy

export async function sendMessageStream(
  history: { role: string, parts: string }[], 
  message: string, 
  systemInstruction: string,
  imageBase64?: string | null
) {
  const response = await fetch('/api/ai/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, message, systemInstruction, imageBase64 })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Lỗi kết nối Gemini Proxy');
  }

  return consumeStream(response);
}

export async function sendOpenAIMessage(apiKey: string, model: string, history: any[], message: string, baseURL?: string) {
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.parts })),
    { role: 'user', content: message }
  ];

  const response = await fetch('/api/ai/openai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model, messages, baseURL })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Lỗi kết nối AI Proxy');
  }

  return consumeStream(response);
}

export async function sendAnthropicMessage(apiKey: string, model: string, history: any[], message: string, system: string) {
  const messages = [
    ...history.map(h => ({ 
      role: h.role === 'user' ? 'user' : 'assistant', 
      content: h.parts 
    })),
    { role: 'user', content: message }
  ];

  const response = await fetch('/api/ai/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, model, messages, system })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Lỗi kết nối Anthropic Proxy');
  }

  return consumeStream(response);
}

async function* consumeStream(response: Response) {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  if (!reader) return;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') break;
        try {
          yield JSON.parse(jsonStr);
        } catch (e) {
          console.error('SSE JSON parse error:', e);
        }
      }
    }
  }
}
