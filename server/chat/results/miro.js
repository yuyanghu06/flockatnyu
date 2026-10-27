export function projectMiroResult({ data, name, result }) {
  if (
    ['list_miro_boards', 'read_miro_board', 'read_miro_item'].includes(name) &&
    result?.boardContext &&
    typeof result.boardContext === 'object'
  ) {
    const encoded = JSON.stringify(result.boardContext);
    if (encoded.length <= 26000) data.boardContext = JSON.parse(encoded);
    else {
      data.possiblyTruncated = true;
      data.complete = false;
    }
  }
}
