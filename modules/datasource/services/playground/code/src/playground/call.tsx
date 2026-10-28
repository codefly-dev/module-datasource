import { Step } from "@codefly-dev/ui/playground";
import { useEffect, useRef, useState } from "react";
import { type Refusal, refusalOf } from "./clients";

// One call this page made, as the kit's Step shows it: what was sent, what came
// back, and either the outcome or the service's own refusal.
type Settled =
  | { state: "running"; request: unknown }
  | { state: "done"; request: unknown; response: unknown; outcome: string }
  | { state: "failed"; request: unknown; refusal: Refusal };

export type Call = Settled & { id: number };

/**
 * Run a call and keep its record. `outcome` says in a sentence what the
 * response means; a failure keeps the service's code and message verbatim.
 */
export function useCall<T>() {
  // Every run is kept, newest last, because the panes that exist to compare —
  // three refusals side by side, page 1 against page 2 — are exactly the ones
  // a latest-only record throws away.
  const [calls, setCalls] = useState<Call[]>([]);
  const [result, setResult] = useState<T>();
  // Each run settles ITS OWN entry. Replacing the last one instead strands a
  // "running" record whenever two calls overlap — which React's development
  // double-invoked effects guarantee on any pane that reads on arrival.
  const nextId = useRef(0);
  async function run(request: unknown, invoke: () => Promise<T>, outcome: (value: T) => string, shown?: (value: T) => unknown) {
    const id = nextId.current++;
    const at = (state: Settled) => setCalls((kept) => kept.map((kept) => (kept.id === id ? ({ ...state, id } as Call) : kept)));
    setCalls((kept) => [...kept, { id, state: "running", request }]);
    setResult(undefined);
    try {
      const value = await invoke();
      setResult(value);
      at({ state: "done", request, response: shown ? shown(value) : value, outcome: outcome(value) });
      return value;
    } catch (error) {
      at({ state: "failed", request, refusal: refusalOf(error) });
      return undefined;
    }
  }
  const call = calls.at(-1);
  return { call, calls, result, run, running: call?.state === "running" };
}

export function CallLog({ title, operation, calls }: { title: string | ((index: number) => string); operation: string; calls: Call[] }) {
  return (
    <>
      {calls.map((call, index) => (
        <CallStep key={call.id} title={typeof title === "function" ? title(index) : title} operation={operation} call={call} />
      ))}
    </>
  );
}

export function CallStep({ title, operation, call }: { title: string; operation: string; call?: Call }) {
  if (!call) return null;
  if (call.state === "failed") {
    return (
      <Step
        title={title}
        operation={operation}
        request={call.request}
        state="failed"
        refusal={`${call.refusal.code}: ${call.refusal.message}`}
      />
    );
  }
  if (call.state === "running") return <Step title={title} operation={operation} request={call.request} state="running" />;
  return <Step title={title} operation={operation} request={call.request} response={call.response} state="done" outcome={call.outcome} />;
}

/**
 * Run something once when a pane arrives, even though React invokes effects
 * twice in development. Without this the call log shows every automatic read
 * twice — and this playground is served by `next dev`, so that is what a
 * person actually sees.
 */
export function useOnArrival(arrive: () => void) {
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    arrive();
    // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  }, []);
}
