import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import type { JSONSchemaType } from 'ajv';
import type { Decision, Observation } from './types';

// Stop validation at the first schema error to bound work for untrusted input.
const ajv = new Ajv();
addFormats(ajv);

// Load schemas
const decisionSchema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../schemas/decision.json'), 'utf-8')
) as JSONSchemaType<Decision>;

const observationSchema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../schemas/observation.json'), 'utf-8')
) as JSONSchemaType<Observation>;

// Compile validators
const validateDecision = ajv.compile<Decision>(decisionSchema);
const validateObservation = ajv.compile<Observation>(observationSchema);

export { validateDecision, validateObservation, ajv };
