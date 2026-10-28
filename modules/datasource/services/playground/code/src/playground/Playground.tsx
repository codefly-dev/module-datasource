"use client";

import { PlaygroundShell } from "@codefly-dev/ui/playground";
import { BookOpen, FileCheck2, Info, List, ListChecks, ShieldX, Waypoints } from "lucide-react";
import { useLayoutEffect, useState } from "react";
import "@codefly-dev/ui/preview.css";
import { Catalog } from "./Catalog";
import { Describe } from "./Describe";
import type { Written } from "./examples";
import { FetchItem } from "./FetchItem";
import { Guide } from "./Guide";
import { ListSource } from "./ListSource";
import { Refusal } from "./Refusal";
import { ThisRun } from "./ThisRun";

const SCENARIOS = [
  { id: "start", label: "Start here", description: "What the datasource module does, every capability it offers, and where to see each one.", icon: <BookOpen aria-hidden="true" /> },
  { id: "catalog", label: "The catalog", description: "The registry's catalog is what announced itself — nothing in it is configured.", icon: <Waypoints aria-hidden="true" /> },
  { id: "describe", label: "Describe", description: "A datasource says what it reaches, whether a read needs a credential, and whether items stream.", icon: <Info aria-hidden="true" /> },
  { id: "list", label: "List a source", description: "The tenant writes its documents; the datasource lists them, a page at a time, with the tenant's credential for each call.", icon: <List aria-hidden="true" /> },
  { id: "fetch", label: "Fetch an item", description: "Stream one item back through the datasource and compare it, byte for byte, with what was written.", icon: <FileCheck2 aria-hidden="true" /> },
  { id: "refused", label: "No credential, no read", description: "A read that carries no usable credential is refused — it never falls back to the deployment's own access.", icon: <ShieldX aria-hidden="true" /> },
  { id: "run", label: "This run", description: "What is running, what stands in for a deployment, and the stopgaps in use.", icon: <ListChecks aria-hidden="true" /> },
];

export function Playground() {
  const [active, setActive] = useState("start");
  const [mode, setMode] = useState<"light" | "dark">("light");
  // What the tenant wrote during this visit, kept across views so a fetch can
  // be compared with the bytes that went in.
  const [written, setWritten] = useState<Written>({});

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
    document.documentElement.style.colorScheme = mode;
  }, [mode]);

  const scenario = SCENARIOS.find((each) => each.id === active) ?? SCENARIOS[0];
  return (
    <PlaygroundShell
      title={scenario.label}
      moduleName="Datasource"
      composition="the local datasource composition: registry, bucket, storage, tenant"
      scenarios={SCENARIOS}
      active={active}
      onSelect={setActive}
      theme={{ mode, onModeChange: setMode }}
    >
      {active === "start" && <Guide onOpen={setActive} />}
      {active === "catalog" && <Catalog />}
      {active === "describe" && <Describe />}
      {active === "list" && <ListSource written={written} onWritten={setWritten} />}
      {active === "fetch" && <FetchItem written={written} onWritten={setWritten} />}
      {active === "refused" && <Refusal onOpen={setActive} />}
      {active === "run" && <ThisRun />}
    </PlaygroundShell>
  );
}
