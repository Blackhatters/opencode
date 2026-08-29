import { describe, expect, test } from "bun:test"
import { createDialogSwarmSessionQuery, loadDialogSwarmSessions, swarmSessionOptions } from "../../src/component/dialog-swarm"

describe("dialog swarm sessions", () => {
  test("lists child sessions instead of roots only", () => {
    expect(createDialogSwarmSessionQuery({ filter: { path: "packages/tui" } })).toEqual({
      limit: 200,
      path: "packages/tui",
    })
  })

  test("searches titles without a roots filter", () => {
    expect(createDialogSwarmSessionQuery({ search: " manager ", filter: { scope: "project" } })).toEqual({
      limit: 50,
      search: "manager",
      scope: "project",
    })
  })

  test("groups children under their parent session", () => {
    expect(
      swarmSessionOptions({
        sessions: [
          { id: "ses_root", title: "Hunt", time: { updated: 20 } },
          { id: "ses_child", title: "M1", parentID: "ses_root", time: { updated: 10 } },
          { id: "ses_orphan", title: "Lost", parentID: "ses_missing", time: { updated: 5 } },
        ],
      }),
    ).toEqual([
      { value: "ses_root", title: "Hunt", category: "Hunt", footer: "ses_root" },
      { value: "ses_child", title: "M1", category: "Hunt", footer: "ses_child" },
      { value: "ses_orphan", title: "Lost", category: "Other", footer: "ses_orphan" },
    ])
  })

  test("falls back when the session list request rejects", async () => {
    expect(
      await loadDialogSwarmSessions({
        filter: {},
        list: () => Promise.reject(new Error("offline")),
      }),
    ).toBeUndefined()
  })
})
