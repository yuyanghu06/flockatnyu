export function projectMemoryResult({ data, name, result }) {
  if (name === 'bug_reports' && result?.status === 'ready' && typeof result.reportId === 'string') {
    data.bugReport = {
      reportId: result.reportId,
      createdAt: result.createdAt,
      outcome: result.outcome,
    };
  }
  if (['read_memory', 'update_memory'].includes(name) && result?.status === 'ready') {
    data.memoryUpdate = { outcome: result.outcome || 'read', updatedAt: result.memory?.updated_at };
  }
}
