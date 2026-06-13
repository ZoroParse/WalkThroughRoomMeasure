/* ------------------------------------------------------------------ *
 * Auto-detect the room layout from a blueprint image using the OpenAI
 * vision API.
 *
 * Runs entirely client-side: the user's API key (held only in their own
 * browser) calls the OpenAI Chat Completions API directly. We use
 * Structured Outputs (a strict JSON schema) so the model returns the
 * layout as a graph — nodes (junctions) + typed edges (one measurable
 * section each) — in normalised 0..1 coordinates, which the caller maps
 * into image pixels.
 *
 * Raw fetch (not the SDK) is deliberate: this ships as one self-contained,
 * no-backend browser file, so we keep the bundle lean and hit the
 * documented wire API directly.
 * ------------------------------------------------------------------ */

import { type ComponentType, type FurnitureKind } from '../state/types.ts';

export interface DetectedNode {
  id: string;
  x: number; // 0..1, fraction of image width (origin top-left)
  y: number; // 0..1, fraction of image height
}
export interface DetectedEdge {
  a: string;
  b: string;
  type: ComponentType;
  loopId?: string | null;
  kind?: FurnitureKind | null;
}
export interface DetectedLayout {
  nodes: DetectedNode[];
  edges: DetectedEdge[];
}

const MODEL = 'gpt-4o';

// Strict Structured-Outputs schema: every object lists all properties in
// `required` and sets additionalProperties:false; optional values are nullable.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['nodes', 'edges'],
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'x', 'y'],
        properties: {
          id: { type: 'string' },
          x: { type: 'number', description: '0=left .. 1=right' },
          y: { type: 'number', description: '0=top .. 1=bottom' },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['a', 'b', 'type', 'loopId', 'kind'],
        properties: {
          a: { type: 'string' },
          b: { type: 'string' },
          type: {
            type: 'string',
            enum: ['wall', 'window', 'door', 'furniture'],
          },
          loopId: {
            type: ['string', 'null'],
            description: 'Furniture edges of one piece share a loopId.',
          },
          kind: {
            type: ['string', 'null'],
            description:
              'Furniture edges only: bed, wardrobe, cabinet, table, desk, sofa, chair, or other.',
          },
        },
      },
    },
  },
} as const;

const PROMPT = `You are reading a 2D architectural floor-plan / blueprint of a single room.
Identify every measurable SECTION and return the layout as a graph.

NODES are junction/corner points — placed wherever a component starts, ends, or meets another component (room corners, the two ends of a door or window opening on a wall, and each corner of a furniture piece). Coordinates are fractions of the image: x from 0 (left) to 1 (right), y from 0 (top) to 1 (bottom).

EDGES connect two nodes and are typed "wall", "window", "door", or "furniture". Each edge is exactly ONE section to be measured.

Rules:
- The room's outer walls form a closed loop of "wall" edges. Where a door or window interrupts a wall, put nodes at the opening's two ends and make that span a "door"/"window" edge, with the remaining solid parts as "wall" edges. Shared corners MUST reuse the same node id so the loop is connected.
- Each furniture piece (bed, wardrobe/robe, bedside table, etc.) is a CLOSED loop of "furniture" edges — one edge per side — all sharing a single loopId. Set "kind" on every edge of the piece (a built-in robe/closet is "wardrobe"; a bedside table is "table"). For wall/window/door edges, set loopId and kind to null.
- Be as accurate as you can with coordinates; they will be shown to the user to confirm and adjust.`;

interface ChatResponse {
  choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  error?: { message?: string };
}

/** Thrown when no server-side proxy is present (e.g. the standalone file). */
export class ProxyUnavailable extends Error {
  constructor() {
    super('No detection proxy at this origin.');
    this.name = 'ProxyUnavailable';
  }
}

/** Thrown when the supplied API key is rejected, so the caller can re-prompt. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

function finalize(layout: DetectedLayout): DetectedLayout {
  if (!layout?.nodes?.length || !layout?.edges?.length)
    throw new Error('No room components were detected in this image.');
  return layout;
}

/**
 * Preferred path: a same-origin serverless proxy (api/detect) holds the API
 * key server-side, so nothing secret reaches the browser. Throws
 * ProxyUnavailable when there is no proxy here (static hosting / local file),
 * so the caller can fall back to a user-supplied key.
 */
export async function detectViaProxy(
  imageDataUrl: string,
): Promise<DetectedLayout> {
  let res: Response;
  try {
    res = await fetch('/api/detect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageDataUrl }),
    });
  } catch {
    throw new ProxyUnavailable(); // network error → no proxy here
  }
  // A static host (no proxy) answers a 404/HTML page, not our JSON — treat any
  // non-JSON response as "no proxy" so we cleanly fall back to a key prompt.
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new ProxyUnavailable();

  let data: { error?: string } & Partial<DetectedLayout>;
  try {
    data = (await res.json()) as typeof data;
  } catch {
    throw new ProxyUnavailable();
  }
  if (!res.ok) throw new Error(data?.error || `Detection failed (${res.status}).`);
  if (!data?.nodes || !data?.edges) throw new ProxyUnavailable();
  return finalize(data as DetectedLayout);
}

/** Fallback: call OpenAI directly with a key the user provides in-browser. */
export async function detectDirect(
  imageDataUrl: string,
  apiKey: string,
): Promise<DetectedLayout> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'blueprint_layout', strict: true, schema: SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const err = (await res.json()) as ChatResponse;
      detail = err?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    if (res.status === 401)
      throw new AuthError('That OpenAI API key was rejected. Enter a different one.');
    throw new Error(
      `Detection failed (${res.status})${detail ? `: ${detail}` : ''}.`,
    );
  }

  const body = (await res.json()) as ChatResponse;
  const msg = body.choices?.[0]?.message;
  if (msg?.refusal) throw new Error(`The model declined: ${msg.refusal}`);
  const text = msg?.content;
  if (!text) throw new Error('The model did not return a layout. Try again.');

  let layout: DetectedLayout;
  try {
    layout = JSON.parse(text) as DetectedLayout;
  } catch {
    throw new Error('Could not read the detected layout. Try again.');
  }
  return finalize(layout);
}
