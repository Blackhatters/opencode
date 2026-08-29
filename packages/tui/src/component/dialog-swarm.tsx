import { ScrollBoxRenderable, TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createMemo, createResource, createSignal, For, Show, type ParentProps } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useSync } from "../context/sync"
import { useRoute } from "../context/route"
import { useTuiConfig } from "../config"
import { useBindings } from "../keymap"
import { DialogSelect } from "../ui/dialog-select"
import { Locale } from "../util/locale"
import { getScrollAcceleration } from "../util/scroll"
import { createDebouncedSignal } from "../util/signal"

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

interface SwarmSession {
  id: string
  title: string
  parentID?: string
  time: { updated: number }
}

const sections: Section[] = ["all", "board", "chat", "dm"]

export function createDialogSwarmSessionQuery(input: { search?: string; filter: { scope?: "project"; path?: string } }) {
  const search = input.search?.trim()
  return {
    limit: search ? 50 : 200,
    ...(search ? { search } : {}),
    ...input.filter,
  }
}

export function loadDialogSwarmSessions<T>(input: {
  search?: string
  filter: { scope?: "project"; path?: string }
  list: (query: ReturnType<typeof createDialogSwarmSessionQuery>) => Promise<{ data?: T[] }>
}) {
  return input.list(createDialogSwarmSessionQuery(input)).then(
    (result) => result.data,
    () => undefined,
  )
}

export function swarmSessionOptions(input: { sessions: ReadonlyArray<SwarmSession> }) {
  const byID = new Map(input.sessions.map((session) => [session.id, session]))
  const children = new Map<string, SwarmSession[]>()
  const roots: SwarmSession[] = []
  const orphans: SwarmSession[] = []
  for (const session of input.sessions) {
    if (!session.parentID) {
      roots.push(session)
      continue
    }
    if (!byID.has(session.parentID)) {
      orphans.push(session)
      continue
    }
    const list = children.get(session.parentID) ?? []
    list.push(session)
    children.set(session.parentID, list)
  }

  const recency = (left: SwarmSession, right: SwarmSession) => right.time.updated - left.time.updated
  const option = (session: SwarmSession, category: string) => ({
    value: session.id,
    title: session.title,
    category,
    footer: Locale.truncate(session.id, 22),
  })

  return [
    ...roots.toSorted(recency).flatMap((root) => [
      option(root, root.title),
      ...(children.get(root.id) ?? []).toSorted(recency).map((child) => option(child, root.title)),
    ]),
    ...orphans.toSorted(recency).map((session) => option(session, "Other")),
  ]
}

export function DialogSwarm() {
  return <DialogSwarmSessions />
}

function DialogSwarmSessions() {
  const dialog = useDialog()
  const route = useRoute()
  const sync = useSync()
  const sdk = useSDK()
  const [search, setSearch] = createDebouncedSignal("", 150)

  const [browseResults] = createResource(
    () => sync.session.query(),
    (filter) => loadDialogSwarmSessions({ filter, list: (query) => sdk.client.session.list(query) }),
  )
  const [searchResults] = createResource(
    () => ({ query: search(), filter: sync.session.query() }),
    (input) => {
      if (!input.query) return undefined
      return loadDialogSwarmSessions({
        search: input.query,
        filter: input.filter,
        list: (query) => sdk.client.session.list(query),
      })
    },
  )

  const currentSessionID = createMemo(() => (route.data.type === "session" ? route.data.sessionID : undefined))
  const sessions = createMemo(() => {
    const result = searchResults() ?? browseResults() ?? sync.data.session
    const synced = new Map(sync.data.session.map((session) => [session.id, session]))
    const query = search().trim().toLowerCase()
    return result
      .map((session) => synced.get(session.id) ?? session)
      .filter(
        (session) => !query || session.title.toLowerCase().includes(query) || session.id.toLowerCase().includes(query),
      )
  })

  const options = createMemo(() => swarmSessionOptions({ sessions: sessions() }))

  return (
    <DialogSelect
      title="Swarm session"
      options={options()}
      skipFilter={true}
      preserveSelection={true}
      current={currentSessionID()}
      onFilter={setSearch}
      onSelect={(option) => {
        const session = sessions().find((item) => item.id === option.value)
        dialog.replace(() => <DialogSwarmView sessionID={option.value} title={session?.title ?? option.title} />)
      }}
    />
  )
}

function DialogSwarmView(props: { sessionID: string; title: string }) {
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
    url.searchParams.set("session", props.sessionID)
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
        key: "s",
        desc: "Sessions",
        group: "Dialog",
        cmd: () => dialog.replace(() => <DialogSwarmSessions />),
      },
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
          s sessions · ↑↓ scroll · esc
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
            <text fg={theme.textMuted} wrapMode="word">
              {props.title} · {props.sessionID}
            </text>
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
                        {(item) => <BoardLine item={item} sessionID={props.sessionID} />}
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

function BoardLine(props: { item: BoardItem; sessionID: string }) {
  const { theme } = useTheme()
  const assigned = props.item.assigneeSessionID === props.sessionID
  return (
    <box>
      <text fg={assigned ? theme.accent : theme.text} wrapMode="word">
        <b>{props.item.kind}</b> {props.item.status} {props.item.title}
      </text>
      <text fg={theme.textMuted} wrapMode="word">
        {props.item.id}
        {props.item.assigneeSessionID ? ` · ${props.item.assigneeSessionID}` : ""}
      </text>
      <Show when={props.item.body}>
        <text fg={theme.text} wrapMode="word">
          {props.item.body}
        </text>
      </Show>
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
