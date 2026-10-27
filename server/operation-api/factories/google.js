import { bindOperationApi } from '../adapter.js';
import { createGoogleOperations } from '../../google/operations/google.js';
export const createGoogleApi = (options) => bindOperationApi(createGoogleOperations(options));

import { createCombinedGoogleOperations } from '../../google/operations/combined.js';
export const createCombinedGoogleOperationApi = (options) =>
  bindOperationApi(createCombinedGoogleOperations(options));
