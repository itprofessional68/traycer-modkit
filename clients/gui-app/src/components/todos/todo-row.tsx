import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AgentSpinningDots } from "@/components/ui/agent-spinning-dots";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useEpicUpdateArtifactStatusDirect } from "@/hooks/epic/use-epic-update-artifact-status-direct-mutation";
import {
  navigateToTabIntent,
  openOrFocusEpicIntent,
} from "@/lib/tab-navigation";
import type { TodoRow as TodoRowData } from "@/lib/todos/group-todos";

/**
 * One ticket: a box that marks it Done (checked) or To do (unchecked), and
 * its title, which opens the ticket in its Task. In progress shows unchecked
 * with a badge.
 */
export function TodoRow(props: { readonly row: TodoRowData }): ReactNode {
  const { row } = props;
  const navigate = useNavigate();
  const write = useEpicUpdateArtifactStatusDirect();
  return (
    <li className="flex min-w-0 items-center gap-2">
      <Checkbox
        checked={row.status === 2}
        disabled={write.isPending}
        aria-label={row.title}
        onCheckedChange={(checked) => {
          write.mutate({
            epicId: row.epicId,
            artifactId: row.artifactId,
            status: checked === true ? 2 : 0,
          });
        }}
      />
      <button
        type="button"
        className="min-w-0 truncate text-left text-ui-sm hover:underline focus-visible:underline focus-visible:outline-none"
        onClick={() => {
          // Cross-Task: the ticket's Task may not be open, so this opens or
          // focuses it with the ticket in focus, as a ticket link does.
          navigateToTabIntent(
            navigate,
            openOrFocusEpicIntent({
              epicId: row.epicId,
              focus: {
                focusedAt: Date.now(),
                focusArtifactId: row.artifactId,
                focusThreadId: undefined,
                migrationSource: undefined,
              },
            }),
            undefined,
          );
        }}
      >
        {row.title}
      </button>
      {row.status === 1 ? (
        <Badge variant="info" size="sm">
          In progress
        </Badge>
      ) : null}
      {write.isPending ? (
        <AgentSpinningDots
          className={undefined}
          testId={undefined}
          variant={undefined}
          tone="muted"
        />
      ) : null}
    </li>
  );
}
