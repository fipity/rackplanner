import { newId } from './ids.js';
import { DesignSchema, type Design, type Rack } from './schemas.js';

export const DEFAULT_RACK: Rack = { width: '19in', heightU: 12, depthMm: null, numbering: 'bottom-up' };

export interface NewDesignInput {
  name?: string | undefined;
  rack?: Partial<Rack> | undefined;
}

/** Build a new, empty, schema-valid design. */
export function createDesign(input: NewDesignInput = {}, now = new Date()): Design {
  const ts = now.toISOString();
  return DesignSchema.parse({
    schemaVersion: 1,
    id: newId('d_'),
    name: input.name?.trim() || 'Untitled rack',
    rack: { ...DEFAULT_RACK, ...input.rack },
    expectedPoeLoadW: null,
    placements: [],
    cables: [],
    createdAt: ts,
    updatedAt: ts,
  });
}
