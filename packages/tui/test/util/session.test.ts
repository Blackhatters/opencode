import { describe, expect, test } from "bun:test"
import { isDefaultTitle, recentSidebarSessions } from "../../src/util/session"

describe("util.session", () => {
  test("recognizes generated parent and child titles", () => {
    expect(isDefaultTitle("New session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("Child session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("New session - custom")).toBeFalse()
  })

  test("keeps the current family first in the sidebar switcher", () => {
    const sessions = [
      { id: "ses_old", title: "Old", time: { updated: 1 } },
      { id: "ses_root", title: "Hunt", time: { updated: 5 } },
      { id: "ses_child", title: "M1", parentID: "ses_root", time: { updated: 9 } },
      { id: "ses_other", title: "Other", time: { updated: 8 } },
    ]
    expect(recentSidebarSessions(sessions, "ses_child").map((session) => session.id)).toEqual([
      "ses_root",
      "ses_child",
      "ses_other",
      "ses_old",
    ])
  })
})
