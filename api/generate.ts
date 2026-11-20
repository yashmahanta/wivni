/**
 * Single-file Vercel Function entry point.
 *
 * All runtime helpers are included in this file. Vercel's ESM runtime
 * cannot resolve extensionless relative imports after transpilation,
 * and relying on the external ../server/gateway file caused HTTP 500.
 * The imports below are TYPES ONLY and are erased by TypeScript.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ModelChoice, MarkType, ModelAvailability } from '../types';

export function getSystemInstruction(marks: MarkType): string {
  const commonThermalPreamble = `
\\documentclass[varwidth=57mm, border=2pt]{standalone}
\\usepackage{amsmath, amssymb, amsfonts, amsthm}
\\usepackage[utf8]{inputenc}
\\setlength{\\parindent}{0pt}
`;

  const outputRules = `
OUTPUT PROTOCOL:

1. IDENTIFY ALL QUESTIONS:
   - Scan the image(s) for EVERY distinct mathematical question present.
   - Extract the extracted text for ALL questions found.
   - Output the text for each question inside [QUESTION_START] and [QUESTION_END], separated by a dashed line (---).

2. IDENTIFY QUESTION NUMBERS:
   - List the numbers of all questions solved (e.g., "1, 2, 3" or "1a-1c").
   - Output them inside [QNUM_START] and [QNUM_END].

3. GENERATE CONSOLIDATED LATEX SOLUTION:
   - Write a SINGLE continuous LaTeX document containing solutions for ALL identified questions.
   - Solve them sequentially (Question 1, then Question 2, etc.).
   - Use \\textbf{Question [No]} to clearly label the start of each new solution.
   - Insert \\vspace{0.5cm}\\hrule\\vspace{0.5cm} between distinct questions.
   - DO NOT put metadata tags (like [QUESTION_START]) inside the LaTeX block.
   - Wrap the LaTeX code inside [LATEX_START] and [LATEX_END].
   - Use this preamble: ${commonThermalPreamble}
   - Start with \\begin{document} and end with \\end{document}.
   - Format for 57mm thermal printer width.
`;

  const depthGuidance: Record<MarkType, string> = {
    1: "Use exactly 1 sentence per question (roughly 8-18 words) and include only the final result.",
    2: "Use 25-40 words per question with a compact derivation and a clear final result.",
    3: "Use 80-120 words per question with key steps, formulas, and short justification.",
    4: "Use 170-230 words per question with full derivation/proof structure and concluding result."
  };

  return `You are a Distinguished Senior Professor of Mathematics specializing in BSc curriculum. 
Solve ALL provided math problems found in the images. Treat each as a ${marks}-mark requirement.

DEPTH REQUIREMENT (MUST FOLLOW STRICTLY):
${depthGuidance[marks]}

WORD-COUNT / LENGTH CONTROL (STRICT):
- Apply the selected ${marks}-mark length to EACH identified question separately.
- Do not exceed the requested length band.
- Keep language concise and exam-ready.

MATHEMATICAL RIGOR:
- Standard BSc/University notation.
- Use Axiomatic Logic.
- Solve every question visible.
- End each question with a clear final answer statement.

${outputRules}`;
}


export const textPrompt = `Analyze these images. Identify and solve ALL questions visible.
  
STRUCTURE YOUR RESPONSE EXACTLY LIKE THIS:

[QUESTION_START]
Question 1: (Text...)
---
Question 2: (Text...)
[QUESTION_END]

[QNUM_START]
(e.g. 1, 2, 3)
[QNUM_END]

[LATEX_START]
\\documentclass...
(The complete LaTeX solution for ALL questions)
[LATEX_END]`;

type Environment = Record<string, string | undefined>;
type RequestWithBody = IncomingMessage & { body?: unknown };

const CONFIG: Record<ModelChoice, { id: string }> = {
  failover: { id: 'website-failover' },
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function gatewayConfig(env: Environment) {
  const raw = env.AI_GATEWAY_URL?.trim() || env.GATEWAY_BASE_URL?.trim();
  const key = env.AI_GATEWAY_API_KEY?.trim() || env.OMNIROUTE_API_KEY?.trim();
  if (!raw || !key) {
    throw new Error('AI gateway is not configured. Set AI_GATEWAY_URL and AI_GATEWAY_API_KEY on your server.');
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('AI_GATEWAY_URL must be a valid URL ending in /v1.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('AI_GATEWAY_URL must use HTTP or HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('AI_GATEWAY_URL must not contain credentials, query parameters or fragments.');
  }
  if (!/\/(v1)\/?$/.test(url.pathname)) {
    throw new Error('AI_GATEWAY_URL must end in /v1, not /chat/completions.');
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('Use an HTTPS gateway URL in production to protect the API key.');
  }
  return { base: url.href.replace(/\/$/, ''), key };
}

function modelIds(env: Environment): Record<ModelChoice, string> {
  const priority = env.AI_MODEL_PRIORITY?.split(',').map(model => model.trim()).filter(Boolean) ?? [];
  return {
    failover: priority[0] || CONFIG.failover.id,
  };
}

function totalTimeout(env: Environment): number {
  const value = Number(env.AI_TOTAL_TIMEOUT_MS ?? 65000);
  if (!Number.isInteger(value) || value < 10000 || value > 120000) {
    throw new Error('AI_TOTAL_TIMEOUT_MS must be an integer between 10000 and 120000.');
  }
  return value;
}

function parseGatewayError(body: unknown, status: number) {
  const raw = typeof body === 'object' && body !== null ? body as Record<string, any> : {};
  const message = typeof raw.error?.message === 'string' ? raw.error.message :
    typeof raw.message === 'string' ? raw.message : `The gateway returned HTTP ${status}.`;
  // Never send raw gateway response objects or accidental secret tokens to browsers.
  return message.slice(0, 500).replace(/sk-[\w-]{12,}/gi, '[redacted]');
}

async function readJSON(req: RequestWithBody): Promise<any> {
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return JSON.parse(req.body);
    return req.body;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 12 * 1024 * 1024) throw new Error('Image upload is too large (12 MB limit).');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function validImage(input: unknown): input is string {
  return typeof input === 'string' && /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(input) && input.length < 5 * 1024 * 1024;
}

function parseContent(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
  return '';
}

async function checkModels(res: ServerResponse, env: Environment) {
  const { base, key } = gatewayConfig(env);
  const ids = modelIds(env);
  let availability: Record<ModelChoice, ModelAvailability> = { failover: 'unknown' };
  try {
    const response = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const models = await response.json() as { data?: Array<{ id?: string }> };
      if (Array.isArray(models.data)) {
        const available = new Set(models.data.map(item => item?.id).filter(Boolean));
        availability = { failover: available.has(ids.failover) ? 'available' : 'not-listed' };
      }
    }
  } catch {
    // Model listings are optional on some OpenAI-compatible gateways.
    // An unverified listing must not be mistaken for an unavailable model.
  }
  json(res, 200, { availability });
}

export async function handleGatewayRequest(req: RequestWithBody, res: ServerResponse, env: Environment = process.env) {
  try {
    if (req.method === 'GET') return await checkModels(res, env);
    if (req.method !== 'POST') return json(res, 405, { error: 'Only GET and POST are supported.' });

    const { base, key } = gatewayConfig(env);
    let payload: any;
    try {
      payload = await readJSON(req);
    } catch {
      return json(res, 400, { error: 'Invalid or oversized JSON upload.' });
    }
    const model: unknown = payload?.model;
    const marks: unknown = payload?.marks;
    const images: unknown = payload?.images;
    if (typeof model !== 'string' || !Object.prototype.hasOwnProperty.call(CONFIG, model)) {
      return json(res, 400, { error: 'Use the automatic website failover route.' });
    }
    if (![1, 2, 3, 4].includes(marks as number)) {
      return json(res, 400, { error: 'Marks must be 1, 2, 3 or 4.' });
    }
    if (!Array.isArray(images) || images.length < 1 || images.length > 10 || !images.every(validImage)) {
      return json(res, 400, { error: 'Upload 1–10 JPEG, PNG, WebP or GIF images smaller than 5 MB each.' });
    }
    const selected = model as ModelChoice;
    const ids = modelIds(env);
    const messages = [
      { role: 'system', content: getSystemInstruction(marks as MarkType) },
      { role: 'user', content: [
        { type: 'text', text: textPrompt },
        ...images.map(img => ({ type: 'image_url', image_url: { url: img } })),
      ] },
    ];

    const upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ids[selected], messages, temperature: 0.1, max_tokens: 8192, stream: false }),
      signal: AbortSignal.timeout(totalTimeout(env)),
    });
    let result: any;
    try {
      result = await upstream.json();
    } catch {
      return json(res, 502, { error: 'Gateway returned an unreadable response.' });
    }
    if (!upstream.ok) {
      return json(res, 502, { error: `${ids[selected]}: ${parseGatewayError(result, upstream.status)}` });
    }
    if (result?.choices?.[0]?.finish_reason === 'length') {
      return json(res, 502, { error: 'The model reached its output-token limit. Try fewer images/questions.' });
    }
    const text = parseContent(result);
    if (!text.trim()) return json(res, 502, { error: `Gateway returned an empty answer for ${ids[selected]}.` });
    return json(res, 200, { text });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return json(res, 504, { error: 'Gateway request timed out. Try fewer questions or another model.' });
    }
    const message = error?.message || 'Unexpected gateway error.';
    return json(res, message.startsWith('AI gateway is not configured') || message.startsWith('AI_GATEWAY_URL') || message.startsWith('Use an HTTPS gateway') ? 503 : 502, { error: message });
  }
}

// Vercel invokes this default export. Secrets stay on the server.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleGatewayRequest(req, res, process.env);
}
