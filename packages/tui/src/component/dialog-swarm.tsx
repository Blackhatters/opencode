import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createResource, createSignal, For, Show, type ParentProps } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useTuiConfig } from "../config"
import { useBindings } from "../keymap"
import { Locale } from "../util/locale"
import { getScrollAcceleration } from "../util/scroll"

type Section = "all" | "board" | "chat" | "dm"

interface BoardItem {
  id: string
  kind: string
  title: string
  body: string
  status: string
  assigneeSessionID?: string
}

interface Message {
  fromAgent: string
  toSessionID?: string
  text: string
  timeCreated: number
}

interface Snapshot {
  swarmID: string
  enabled: boolean
  board: BoardItem[]
  chat: Message[]
  dm: Message[]
}

const sections: Section[] = ["all", "board", "chat", "dm"]

export function DialogSwarm() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const sdk = useSDK()
  const tuiConfig = useTuiConfig()
  const dimensions = useTerminalDimensions()
  const scrollAcceleration = createMemo(() => getScrollAcceleration(tuiConfig))
  const [section, setSection] = createSignal<Section>("all")
  let scroll: ScrollBoxRenderable | undefined

  dialog.setSize("large")

  const listHeight = createMemo(() => Math.max(8, dimensions().height - Math.floor(dimensions().height / 4) - 8))

  const [snapshot] = createResource(async () => {
    const url = new URL("/experimental/swarm", sdk.url)
    if (sdk.directory) url.searchParams.set("directory", sdk.directory)
    const response = await sdk.fetch(url.toString())
    if (!response.ok) throw new Error(`Failed to load swarm (${response.status})`)
    return (await response.json()) as Snapshot
  })

  const pinBottom = () => {
    const box = scroll
    if (!box || box.isDestroyed) return
    box.scrollTo(box.scrollHeight)
  }

  createEffect(() => {
    snapshot()
    section()
    requestAnimationFrame(() => {
      pinBottom()
      requestAnimationFrame(pinBottom)
    })
  })

  useBindings(() => ({
    bindings: [
      {
        key: "tab",
        desc: "Next section",
        group: "Dialog",
        cmd: () => {
          const index = sections.indexOf(section())
          setSection(sections[(index + 1) % sections.length])
        },
      },
      {
        key: "up",
        desc: "Scroll up",
        group: "Dialog",
        cmd: () => scroll?.scrollBy(-1),
      },
      {
        key: "down",
        desc: "Scroll down",
        group: "Dialog",
        cmd: () => scroll?.scrollBy(1),
      },
      {
        key: "pageup",
        desc: "Page up",
        group: "Dialog",
        cmd: () => {
          if (scroll) scroll.scrollBy(-scroll.height)
        },
      },
      {
        key: "pagedown",
        desc: "Page down",
        group: "Dialog",
        cmd: () => {
          if (scroll) scroll.scrollBy(scroll.height)
        },
      },
      {
        key: "home",
        desc: "Jump to oldest",
        group: "Dialog",
        cmd: () => scroll?.scrollTo(0),
      },
      {
        key: "end",
        desc: "Jump to latest",
        group: "Dialog",
        cmd: () => pinBottom(),
      },
    ],
  }))

  const title = createMemo(() => {
    const data = snapshot()
    if (!data) return "Swarm"
    return `Swarm ${data.enabled ? "enabled" : "disabled"}`
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {title()}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          ↑↓ scroll · esc
        </text>
      </box>
      <Show when={snapshot.error}>
        <text fg={theme.error}>Could not load swarm data</text>
      </Show>
      <Show when={snapshot.loading && !snapshot()}>
        <text fg={theme.textMuted}>Loading...</text>
      </Show>
      <Show when={snapshot()}>
        {(data) => (
          <box gap={1}>
            <text fg={theme.textMuted}>
              {data().swarmID} · tab {section()}
            </text>
            <scrollbox
              ref={(box: ScrollBoxRenderable) => {
                scroll = box
              }}
              maxHeight={listHeight()}
              stickyScroll={true}
              stickyStart="bottom"
              scrollAcceleration={scrollAcceleration()}
              verticalScrollbarOptions={{
                visible: true,
                trackOptions: {
                  backgroundColor: theme.backgroundElement,
                  foregroundColor: theme.border,
                },
              }}
            >
              <box gap={1} paddingRight={1}>
                <Show when={section() === "all" || section() === "board"}>
                  <Section title="Board">
                    <Show when={data().board.length > 0} fallback={<text fg={theme.textMuted}>(no items)</text>}>
                      <For each={data().board}>
                        {(item) => (
                          <box>
                            <text fg={theme.text} wrapMode="word">
                              <b>{item.kind}</b> {item.status} {item.title}
                            </text>
                            <text fg={theme.textMuted} wrapMode="word">
                              {item.id}
                              {item.assigneeSessionID ? ` · ${item.assigneeSessionID}` : ""}
                            </text>
                            <Show when={item.body}>
                              <text fg={theme.text} wrapMode="word">
                                {item.body}
                              </text>
                            </Show>
                          </box>
                        )}
                      </For>
                    </Show>
                  </Section>
                </Show>
                <Show when={section() === "all" || section() === "chat"}>
                  <Section title="Chat">
                    <Show when={data().chat.length > 0} fallback={<text fg={theme.textMuted}>(empty)</text>}>
                      <For each={data().chat}>{(message) => <MessageLine message={message} />}</For>
                    </Show>
                  </Section>
                </Show>
                <Show when={section() === "all" || section() === "dm"}>
                  <Section title="Direct messages">
                    <Show when={data().dm.length > 0} fallback={<text fg={theme.textMuted}>(empty)</text>}>
                      <For each={data().dm}>{(message) => <MessageLine message={message} />}</For>
                    </Show>
                  </Section>
                </Show>
              </box>
            </scrollbox>
          </box>
        )}
      </Show>
    </box>
  )
}

function Section(props: ParentProps<{ title: string }>) {
  const { theme } = useTheme()
  return (
    <box>
      <text fg={theme.text} attributes={TextAttributes.BOLD}>
        {props.title}
      </text>
      {props.children}
    </box>
  )
}

function MessageLine(props: { message: Message }) {
  const { theme } = useTheme()
  const to = props.message.toSessionID ? ` -> ${props.message.toSessionID}` : ""
  return (
    <text fg={theme.text} wrapMode="word">
      <span style={{ fg: theme.textMuted }}>{Locale.todayTimeOrDateTime(props.message.timeCreated)}</span>{" "}
      <b>
        {props.message.fromAgent}
        {to}
      </b>{" "}
      {props.message.text}
    </text>
  )
}
