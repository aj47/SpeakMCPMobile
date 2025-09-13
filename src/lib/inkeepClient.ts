export type InkeepConfig = {
  manageBaseUrl: string; // CRUD (projects, agents) e.g., http://localhost:3002
  runBaseUrl: string;    // Run API (chat)       e.g., http://localhost:3003
  apiKey: string;
  tenantId: string;
  projectId: string;
  graphId: string;
  model?: string; // optional model name for /v1/chat/completions
};

export type ChatMessage = {
  id?: string;
  role: 'system' | 'user' | 'assistant';
  content?: string;
};

export class InkeepClient {
  private cfg: InkeepConfig;

  constructor(cfg: InkeepConfig) {
    this.cfg = cfg;
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      'Content-Type': 'application/json',
    } as const;
  }

  /** Health check for a base URL */
  async health(base: 'manage' | 'run'): Promise<boolean> {
    const url = `${base === 'manage' ? this.cfg.manageBaseUrl : this.cfg.runBaseUrl}/health`;
    try {
      const res = await fetch(url);
      return res.ok;
    } catch {
      return false;
    }
  }

  /** GET Manage API: /tenants/{tenantId}/crud/projects/{projectId}/agents */
  async listAgents(): Promise<{ id: string; name: string; description?: string }[]> {
    const url = `${this.cfg.manageBaseUrl}/tenants/${this.cfg.tenantId}/crud/projects/${this.cfg.projectId}/agents`;
    const res = await fetch(url, { headers: this.authHeaders() });
    if (!res.ok) throw new Error(`List agents failed: ${res.status}`);
    const data = await res.json();
    return data?.data ?? [];
  }

  /**
   * POST Run API (Standard Mode): /v1/chat/completions with API key
   * If the server responds with text/event-stream, this will parse SSE chunks and accumulate assistant content.
   * You can pass an onToken callback to receive incremental tokens.
   */
  async chat(
    messages: ChatMessage[],
    conversationId?: string,
    onToken?: (token: string) => void
  ): Promise<string> {
    const url = `${this.cfg.runBaseUrl}/v1/chat/completions`;
    const body = { model: this.cfg.model, messages, conversationId, stream: true } as any;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Chat failed: ${res.status} ${text}`);
    }

    const ct = res.headers.get('content-type') || '';
    // If not streaming, just try to parse JSON and return the assistant content
    if (!ct.includes('text/event-stream') || !('body' in res) || !res.body) {
      const text = await res.text();
      // Try to extract choices[0].message.content if JSON
      try {
        const j = JSON.parse(text);
        const content = j?.choices?.[0]?.message?.content ?? '';
        return typeof content === 'string' ? content : text;
      } catch {
        return text;
      }
    }

    // Streaming parse
    const decoder = new TextDecoder();
    const reader = (res.body as ReadableStream<Uint8Array>).getReader();
    let buffer = '';
    let finalText = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 2);
        if (!chunk) continue;
        // Each SSE event line typically starts with "data: "
        const lines = chunk.split('\n').map(l => l.replace(/^data:\s?/, ''));
        for (const l of lines) {
          if (!l) continue;
          if (l === '[DONE]' || l === '"[DONE]"') {
            // End of stream
            return finalText;
          }
          try {
            const obj = JSON.parse(l);
            const delta = obj?.choices?.[0]?.delta;
            const token = delta?.content;
            if (typeof token === 'string' && token.length > 0) {
              // Some streams include JSON-encoded control messages in content; skip those
              if (token.trim().startsWith('{')) {
                try {
                  const inner = JSON.parse(token);
                  if (inner?.type === 'data-operation') {
                    continue; // ignore control events
                  }
                } catch {}
              }
              finalText += token;
              onToken?.(token);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      }
    }
    return finalText;
  }
}

