/* ------------------------------------------------------------------ *
 * Server-side proxy for blueprint auto-detection (Vercel Edge function).
 *
 * The browser app POSTs { imageDataUrl } here; this function adds the
 * OpenAI API key from a SERVER-SIDE environment variable and calls
 * OpenAI, returning the detected { nodes, edges } layout. The key is
 * therefore never sent to the browser and never lives in the repo —
 * set it in Vercel → Project → Settings → Environment Variables as
 * OPENAI_API_KEY. Because the app is served from the same origin as
 * this function, no CORS is opened up.
 * ------------------------------------------------------------------ */

export const config = { runtime: 'edge' };

const MODEL = 'gpt-4o';

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
          type: { type: 'string', enum: ['wall', 'window', 'door', 'furniture'] },
          loopId: { type: ['string', 'null'] },
          kind: { type: ['string', 'null'] },
        },
      },
    },
  },
};

const PROMPT = `You are reading a 2D architectural floor-plan / blueprint of a single room.
Identify every measurable SECTION and return the layout as a graph.

NODES are junction/corner points — placed wherever a component starts, ends, or meets another component (room corners, the two ends of a door or window opening on a wall, and each corner of a furniture piece). Coordinates are fractions of the image: x from 0 (left) to 1 (right), y from 0 (top) to 1 (bottom).

EDGES connect two nodes and are typed "wall", "window", "door", or "furniture". Each edge is exactly ONE section to be measured.

Rules:
- The room's outer walls form a closed loop of "wall" edges. Where a door or window interrupts a wall, put nodes at the opening's two ends and make that span a "door"/"window" edge, with the remaining solid parts as "wall" edges. Shared corners MUST reuse the same node id so the loop is connected.
- Each furniture piece (bed, wardrobe/robe, bedside table, etc.) is a CLOSED loop of "furniture" edges — one edge per side — all sharing a single loopId. Set "kind" on every edge of the piece (a built-in robe/closet is "wardrobe"; a bedside table is "table"). For wall/window/door edges, set loopId and kind to null.
- Be as accurate as you can with coordinates; they will be shown to the user to confirm and adjust.`;

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405);

  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  const key = env?.OPENAI_API_KEY;
  if (!key)
    return json(
      { error: 'Server is missing OPENAI_API_KEY. Set it in Vercel settings.' },
      500,
    );

  let imageDataUrl: string | undefined;
  try {
    const body = (await req.json()) as { imageDataUrl?: string };
    imageDataUrl = body?.imageDataUrl;
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  if (!imageDataUrl) return json({ error: 'Missing imageDataUrl.' }, 400);

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
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

  if (!r.ok) {
    let detail = '';
    try {
      const e = (await r.json()) as { error?: { message?: string } };
      detail = e?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    return json({ error: `OpenAI ${r.status}${detail ? `: ${detail}` : ''}` }, 502);
  }

  const data = (await r.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null } }[];
  };
  const msg = data?.choices?.[0]?.message;
  if (msg?.refusal) return json({ error: `Model declined: ${msg.refusal}` }, 502);
  const text = msg?.content;
  if (!text) return json({ error: 'No layout returned.' }, 502);

  let layout: unknown;
  try {
    layout = JSON.parse(text);
  } catch {
    return json({ error: 'Could not parse the detected layout.' }, 502);
  }
  return json(layout, 200);
}
