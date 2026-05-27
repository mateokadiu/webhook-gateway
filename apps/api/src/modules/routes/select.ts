import { evaluateRules, type RouteRules, type RouteEvalInput, type RouteEvalResult } from './rules.js';

export interface TargetLike {
  id: string;
}

export interface RouteLike {
  targetId: string;
  enabled: boolean;
  rules: RouteRules | null | unknown;
}

export interface RouteDecision {
  target: TargetLike;
  forward: boolean;
  reason?: RouteEvalResult extends { reason: infer R } ? R : never | 'route-disabled';
  detail?: string;
}

/**
 * Pure dispatcher: for each enabled target, look up the matching route (by
 * `target.id`) and run the rules evaluator. Returns one decision per target.
 *
 * Missing route ⇒ default (no filter) ⇒ `forward: true`.
 * Disabled route ⇒ `forward: false, reason: 'route-disabled'`.
 *
 * Kept separate from ProcessorService so we can unit-test without a DB.
 */
export function dispatch(
  targets: readonly TargetLike[],
  routes: readonly RouteLike[],
  event: RouteEvalInput,
): RouteDecision[] {
  const byTarget = new Map<string, RouteLike>();
  for (const r of routes) byTarget.set(r.targetId, r);

  return targets.map((t) => {
    const route = byTarget.get(t.id);
    if (route && route.enabled === false) {
      return { target: t, forward: false, reason: 'route-disabled' as never };
    }
    const decision = evaluateRules(route?.rules as RouteRules | null, event);
    if (decision.forward) return { target: t, forward: true };
    return {
      target: t,
      forward: false,
      reason: decision.reason as never,
      detail: decision.detail,
    };
  });
}
