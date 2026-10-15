import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pg = require('pg');

export const Pool = pg.Pool;
export const Client = pg.Client;
export const types = pg.types;
export const Query = pg.Query;
export const DatabaseError = pg.DatabaseError;
export const escapeIdentifier = pg.escapeIdentifier;
export const escapeLiteral = pg.escapeLiteral;
export const Result = pg.Result;
export const defaults = pg.defaults;

export default pg;
