import { Step } from "@codefly-dev/ui/playground";
import { useState } from "react";
import { type Refusal, refusalOf } from "./clients";

// One call this page made, as the kit's Step shows it: what was sent, what came
// back, and either the outcome or the service's own refusal.
export type Call =
  | { state: "running"; request: unknown }
  | { state: "done"; request: unknown; response: unknown; outcome: string }
  | { state: "failed"; request: unknown; refusal: Refusal };

/**
 * Run a call and keep its record. `outcome` says in a sentence what the
 * response means; a failure keeps the service's code and message verbatim.
 */
export function useCall<T>() {
  const [call, setCall] = useState<Call>();
  const [result, setResult] = useState<T>();
  async function run(request: unknown, invoke: () => Promise<T>, outcome: (value: T) => string, shown?: (value: T) => unknown) {
    setCall({ state: "running", request });
    setResult(undefined);
    try {
      const value = await invoke();
      setResult(value);
      setCall({ state: "done", request, response: shown ? shown(value) : value, outcome: outcome(value) });
      return value;
    } catch (error) {
      setCall({ state: "failed", request, refusal: refusalOf(error) });
      return undefined;
    }
  }
  return { call, result, run, running: call?.state === "running" };
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
