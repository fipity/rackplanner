import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { faceLayoutFor, isPortRegion, portTypeOf, type Part } from '@rackplanner/shared';
import { loadCatalog } from './catalog-lib.js';
