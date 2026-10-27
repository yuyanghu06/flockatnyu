import { bindOperationApi } from '../adapter.js';
import { createBugReportOperations } from '../../knowledge/operations/bug-reports.js';

export const createBugReportApi = (options) => bindOperationApi(createBugReportOperations(options));
