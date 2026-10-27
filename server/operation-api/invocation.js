// No actor, lease or capability is trusted merely because it arrived in JSON.
// Only this process can bind a concrete Request to an existing service/context.
const issued = new WeakMap();
const outcomes = new WeakMap();

export function bindInvocation(request, owner, operation, context, invoke, definition) {
  issued.set(request, { owner, epoch: owner.epoch, operation, context, invoke, definition });
}

export function consumeInvocation(request, owner, operation) {
  const binding = issued.get(request);
  issued.delete(request);
  if (
    !binding ||
    binding.owner !== owner ||
    owner.closed ||
    binding.epoch !== owner.epoch ||
    binding.operation !== operation
  )
    return null;
  return binding;
}

export function recordOutcome(request, outcome) {
  outcomes.set(request, outcome);
}
export function consumeOutcome(request) {
  const outcome = outcomes.get(request);
  outcomes.delete(request);
  return outcome;
}

export function invocationActive(binding) {
  return !binding.owner.closed && binding.epoch === binding.owner.epoch;
}
