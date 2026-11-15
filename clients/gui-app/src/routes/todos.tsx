import { createFileRoute } from "@tanstack/react-router";
import { requireSignedIn } from "@/lib/router-auth";

export const Route = createFileRoute("/todos")({
  beforeLoad: ({ context }) => {
    requireSignedIn(context);
  },
  // The descriptor renders the body once inside TopLevelTabHost.
  component: () => null,
});
