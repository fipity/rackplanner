import { newId } from './ids.js';
import { DESIGN_SCHEMA_VERSION, DesignSchema, type Design, type Rack, type RackFrame } from './schemas.js';

export function defaultFrame(width: Rack['width']): RackFrame {
  return width === '10in' ? 'mini-10in' : 'open-4post';
}

export const DEFAULT_RACK: Rack = { width: '19in', heightU: 12, depthMm: null, numbering: 'bottom-up', frame: 'open-4post', glassDoor: false };

export interface NewDesignInput {
  name?: string | undefined;
  rack?: Partial<Rack> | undefined;
}

/** Build a new, empty, schema-valid design. */
export function createDesign(input: NewDesignInput = {}, now = new Date()): Design {
  const ts = now.toISOString();
  return DesignSchema.parse({
    schemaVersion: DESIGN_SCHEMA_VERSION,
    id: newId('d_'),
    name: input.name?.trim() || 'Untitled rack',
    rack: {
      ...DEFAULT_RACK,
      ...input.rack,
      frame: input.rack?.frame ?? defaultFrame(input.rack?.width ?? DEFAULT_RACK.width),
    },
    expectedPoeLoadW: null,
    placements: [],
    cables: [],
    createdAt: ts,
    updatedAt: ts,
  });
}
