// Audit storage is private operational data, never assistant retrieval context.
export function startAuditMaintenance(audit, {intervalMs=3600000}={}) {
  if (!audit?.configured || typeof audit.prune!=='function') return () => {};
  const prune=()=>Promise.resolve().then(()=>audit.prune()).catch(()=>{});
  void prune();
  const timer=setInterval(()=>{void prune();},intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
