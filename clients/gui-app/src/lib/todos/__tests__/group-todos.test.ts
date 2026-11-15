import { describe, expect, it } from "vitest";
import type { EpicMentionTicketSuggestion } from "@traycer/protocol/host/epic/unary-schemas";
import { groupTodos, ticketStatusOf } from "@/lib/todos/group-todos";

function ticket(
  overrides: Partial<EpicMentionTicketSuggestion>,
): EpicMentionTicketSuggestion {
  return {
    kind: "epic-artifact",
    id: "row",
    token: "token",
    epicId: "task-a",
    epicTitle: "Task A",
    artifactId: "ticket-1",
    artifactType: "ticket",
    label: "Ticket",
    description: "",
    status: 0,
    updatedAt: 1,
    ...overrides,
  };
}

describe("groupTodos", () => {
  const tickets = [
    ticket({ artifactId: "a-old", label: "A old", updatedAt: 1 }),
    ticket({ artifactId: "a-done", label: "A done", status: 2, updatedAt: 9 }),
    ticket({ artifactId: "a-new", label: "A new", status: 1, updatedAt: 5 }),
    ticket({
      epicId: "task-b",
      epicTitle: "Task B",
      artifactId: "b-only",
      label: "B only",
      updatedAt: 7,
    }),
    ticket({
      epicId: "task-c",
      epicTitle: "Task C",
      artifactId: "c-done",
      label: "C done",
      status: 2,
      updatedAt: 3,
    }),
  ];

  it("groups by Task, newest Task and newest ticket first", () => {
    expect(
      groupTodos(tickets, "all").map((group) => [
        group.epicTitle,
        group.rows.map((row) => row.artifactId),
      ]),
    ).toEqual([
      ["Task A", ["a-done", "a-new", "a-old"]],
      ["Task B", ["b-only"]],
      ["Task C", ["c-done"]],
    ]);
  });

  it("leaves out done tickets, and Tasks with nothing left, when open", () => {
    expect(
      groupTodos(tickets, "open").map((group) => [
        group.epicTitle,
        group.rows.map((row) => row.artifactId),
      ]),
    ).toEqual([
      ["Task B", ["b-only"]],
      ["Task A", ["a-new", "a-old"]],
    ]);
  });

  it("sorts a ticket the host gives no time for last", () => {
    expect(
      groupTodos(
        [
          ticket({ artifactId: "untimed", updatedAt: undefined }),
          ticket({ artifactId: "timed", updatedAt: 4 }),
        ],
        "all",
      )[0].rows.map((row) => [row.artifactId, row.updatedAt]),
    ).toEqual([
      ["timed", 4],
      ["untimed", 0],
    ]);
  });
});

describe("ticketStatusOf", () => {
  it("reads a missing or unknown status as To do", () => {
    expect([null, 0, 1, 2, 7].map(ticketStatusOf)).toEqual([0, 0, 1, 2, 0]);
  });
});
