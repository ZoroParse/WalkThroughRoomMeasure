/* ------------------------------------------------------------------ *
 * Auto-detect the room layout from a blueprint image using Claude vision.
 *
 * Runs entirely client-side: the user's API key (held only in their own
 * browser) calls the Anthropic Messages API directly. We force a single
 * tool call so the model returns the layout as a structured graph —
 * nodes (junctions) + typed edges (one measurable section each) — in
 * normalised 0..1 coordinates, which the caller maps into image pixels.
 *
 * Raw fetch (not the SDK) is a deliberate choice here: this ships as one
 * self-contained, no-backend browser file, so we keep the bundle lean and
 * avoid Node shims by hitting the documented wire API directly.
 * ------------------------------------------------------------------ */

import { type ComponentType } from '../state/types.ts';

export interface DetectedNode {
  id: string;
  x: number; // 0..1, fraction of image width (origin top-left)
  y: number; // 0..1, fraction of image height
}
export interface DetectedEdge {
  a: string;
  b: string;
  type: ComponentType;
  loopId?: string;
}
export interface DetectedLayout {
  nodes: DetectedNode[];
  edges: DetectedEdge[];
}

const MODEL = 'claude-opus-4-8';

const REPORT_TOOL = {
  name: 'report_blueprint',
  description:
    'Report the detected room layout as a graph of junction nodes and typed edges.',
  input_schema: {
    type: 'object',
    properties: {
      nodes: {
        type: 'array',
        description:
          'Junction/corner points. Coordinates are fractions of the image (x: 0=left..1=right, y: 0=top..1=bottom).',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            x: { type: 'number' },
            y: { type: 'number' },
          },
          required: ['id', 'x', 'y'],
        },
      },
      edges: {
        type: 'array',
        description:
          'One edge per measurable section, between two node ids. Shared junctions reuse the same node id.',
        items: {
          type: 'object',
          properties: {
            a: { type: 'string' },
            b: { type: 'string' },
            type: {
              type: 'string',
              enum: ['wall', 'window', 'door', 'furniture'],
            },
            loopId: {
              type: 'string',
              description: 'Furniture edges of one piece share a loopId.',
            },
          },
          required: ['a', 'b', 'type'],
        },
      },
    },
    required: ['nodes', 'edges'],
  },
} as const;

const PROMPT = `You are reading a 2D architectural floor-plan / blueprint of a single room.
Identify every measurable SECTION and return them via the report_blueprint tool.

Model the room as a GRAPH:
- NODES are junction/corner points — placed wherever a component starts, ends, or meets another component (room corners, the two ends of a door or window opening on a wall, and each corner of a furniture piece). Coordinates are fractions of the image: x from 0 (left) to 1 (right), y from 0 (top) to 1 (bottom).
- EDGES connect two nodes and are typed: "wall", "window", "door", or "furniture". Each edge is exactly ONE section to be measured.

Rules:
- The room's outer walls form a closed loop of "wall" edges. Where a door or window interrupts a wall, put nodes at the opening's two ends and make that span a "door"/"window" edge, with the remaining solid parts as "wall" edges. Shared corners must reuse the SAME node id (so the loop is connected).
- Each furniture piece (bed, wardrobe/robe, bedside table, etc.) is a CLOSED loop of "furniture" edges — one edge per side — all sharing a single loopId.
- Be as accurate as you can with coordinates; they will be shown to the user to confirm and adjust.
Return ONLY the tool call.`;

interface ToolUseBlock {
  type: 'tool_use';
  name: string;
  input: DetectedLayout;
}

/** Call Claude vision and return the detected layout (normalised coords). */
export async function detectLayout(
  imageDataUrl: string,
  apiKey: string,
): Promise<DetectedLayout> {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
  if (!m) throw new Error('Unsupported image format for detection.');
  const [, mediaType, data] = m;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report_blueprint' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    let detail = '';
    try {
      const err = await res.json();
      detail = err?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    if (res.status === 401)
      throw new Error('That API key was rejected. Check it and try again.');
    throw new Error(
      `Detection failed (${res.status})${detail ? `: ${detail}` : ''}.`,
    );
  }

  const body = (await res.json()) as { content: unknown[] };
  const tool = (body.content as ToolUseBlock[]).find(
    (b) => b?.type === 'tool_use' && b?.name === 'report_blueprint',
  );
  if (!tool) throw new Error('The model did not return a layout. Try again.');

  const layout = tool.input;
  if (!layout?.nodes?.length || !layout?.edges?.length)
    throw new Error('No room components were detected in this image.');
  return layout;
}
