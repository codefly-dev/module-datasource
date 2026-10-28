import { Playground } from "@/playground/Playground";

// The playground is the whole page: the shell owns navigation between
// scenarios, so there is nothing to lay out around it here.
export default function Home() {
  return <Playground />;
}
