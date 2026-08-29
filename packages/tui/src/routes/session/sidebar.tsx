import { useProject } from "../../context/project"
import { useSync } from "../../context/sync"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useTuiConfig } from "../../config"
import { useRoute } from "../../context/route"
import { InstallationChannel, InstallationVersion } from "@opencode-ai/core/installation/version"
import { usePluginRuntime } from "../../plugin/runtime"

import { getScrollAcceleration } from "../../util/scroll"
import { WorkspaceLabel } from "../../component/workspace-label"
import { Locale } from "../../util/locale"
import { recentSidebarSessions } from "../../util/session"

export function Sidebar(props: { sessionID: string; overlay?: boolean }) {
  const pluginRuntime = usePluginRuntime()
  const project = useProject()
  const sync = useSync()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const session = createMemo(() => sync.session.get(props.sessionID))
  const workspace = () => {
    const workspaceID = session()?.workspaceID
    if (!workspaceID) return
    return project.workspace.get(workspaceID)
  }
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))

  return (
    <Show when={session()}>
      <box
        backgroundColor={theme.backgroundPanel}
        width={42}
        height="100%"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
        position={props.overlay ? "absolute" : "relative"}
      >
        <scrollbox
          flexGrow={1}
          scrollAcceleration={scrollAcceleration()}
          verticalScrollbarOptions={{
            trackOptions: {
              backgroundColor: theme.background,
              foregroundColor: theme.borderActive,
            },
          }}
        >
          <box flexShrink={0} gap={1} paddingRight={1}>
            <pluginRuntime.Slot
              name="sidebar_title"
              mode="single_winner"
              session_id={props.sessionID}
              title={session()!.title}
              share_url={session()!.share?.url}
            >
              <box paddingRight={1}>
                <text fg={theme.text}>
                  <b>{session()!.title}</b>
                </text>
                <Show when={InstallationChannel !== "latest"}>
                  <text fg={theme.textMuted}>{props.sessionID}</text>
                </Show>
                <Show when={session()!.workspaceID}>
                  <text fg={theme.textMuted}>
                    <Show
                      when={workspace()}
                      fallback={<WorkspaceLabel type="unknown" name={session()!.workspaceID!} status="error" icon />}
                    >
                      {(item) => (
                        <WorkspaceLabel
                          type={item().type}
                          name={item().name}
                          status={project.workspace.status(item().id) ?? "error"}
                          icon
                        />
                      )}
                    </Show>
                  </text>
                </Show>
                <Show when={session()!.share?.url}>
                  <text fg={theme.textMuted}>{session()!.share!.url}</text>
                </Show>
              </box>
            </pluginRuntime.Slot>
            <SessionSwitcher sessionID={props.sessionID} />
            <pluginRuntime.Slot name="sidebar_content" session_id={props.sessionID} />
          </box>
        </scrollbox>

        <box flexShrink={0} gap={1} paddingTop={1}>
          <pluginRuntime.Slot name="sidebar_footer" mode="single_winner" session_id={props.sessionID}>
            <text fg={theme.textMuted}>
              <span style={{ fg: theme.success }}>•</span> <b>Open</b>
              <span style={{ fg: theme.text }}>
                <b>Code</b>
              </span>{" "}
              <span>{InstallationVersion}</span>
            </text>
          </pluginRuntime.Slot>
        </box>
      </box>
    </Show>
  )
}

function SessionSwitcher(props: { sessionID: string }) {
  const route = useRoute()
  const sync = useSync()
  const { theme } = useTheme()
  const [open, setOpen] = createSignal(true)
  const items = createMemo(() => recentSidebarSessions(sync.data.session, props.sessionID))

  return (
    <Show when={items().length > 0}>
      <box>
        <box flexDirection="row" gap={1} onMouseDown={() => items().length > 2 && setOpen((value) => !value)}>
          <Show when={items().length > 2}>
            <text fg={theme.text}>{open() ? "▼" : "▶"}</text>
          </Show>
          <text fg={theme.text}>
            <b>Sessions</b>
          </text>
        </box>
        <Show when={items().length <= 2 || open()}>
          <For each={items()}>
            {(session) => {
              const current = session.id === props.sessionID
              return (
                <text
                  fg={current ? theme.accent : theme.textMuted}
                  wrapMode="none"
                  onMouseUp={() => {
                    if (current) return
                    route.navigate({ type: "session", sessionID: session.id })
                  }}
                >
                  {session.parentID ? "  " : ""}
                  {Locale.truncate(session.title, session.parentID ? 34 : 36)}
                </text>
              )
            }}
          </For>
        </Show>
      </box>
    </Show>
  )
}
