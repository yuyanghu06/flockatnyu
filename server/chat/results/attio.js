export function projectAttioResult({ data, name, result }) {
  if (
    [
      'search_attio_records',
      'read_attio_record',
      'create_attio_record',
      'update_attio_record',
      'list_attio_attributes',
    ].includes(name)
  ) {
    for (const key of ['attioContext', 'attioWrite']) {
      const value = result?.[key];
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Buffer.byteLength(JSON.stringify(value)) <= 20000
      )
        data[key] = value;
    }
  }
}
