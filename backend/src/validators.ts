import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';
import { Decision, Observation } from './types';

// Create AJV instance with allErrors
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Load schemas
const decisionSchema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../schemas/decision.json'), 'utf-8')
);

const observationSchema = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../schemas/observation.json'), 'utf-8')
);

// Compile validators
const validateDecision = ajv.compile<Decision>(decisionSchema);
const validateObservation = ajv.compile<Observation>(observationSchema);

export { validateDecision, validateObservation, ajv };
