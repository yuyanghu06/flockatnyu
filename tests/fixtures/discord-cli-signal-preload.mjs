// Local-only process fixture: no network request can leave the CLI child.
globalThis.fetch = async (_url, {signal} = {}) => new Promise((_resolve,reject) => {
  const keepAlive = setInterval(() => {},1000);
  process.stderr.write('fixture-request-started\n');
  const stop = () => {clearInterval(keepAlive);reject(new DOMException('Aborted fixture request','AbortError'));};
  if (signal?.aborted) stop();
  else signal?.addEventListener('abort',stop,{once:true});
});
