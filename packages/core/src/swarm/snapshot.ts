export * as SwarmSnapshot from "./snapshot"

const MAX_ITEMS = 20
const MAX_BODY = 400

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

export interface Item {
  readonly id: string
  readonly kind: string
  readonly status: string
  readonly title: string
  readonly body: string
  readonly assigneeSessionID?: string
}

export interface Message {
  readonly fromAgent: string
  readonly text: string
}

function clip(value: string) {
  if (value.length <= MAX_BODY) return value
  return `${value.slice(0, MAX_BODY)}…`
}

function renderItem(item: Item) {
  return [
    "    <item>",
    `      <id>${escapeXml(item.id)}</id>`,
    `      <kind>${escapeXml(item.kind)}</kind>`,
    `      <status>${escapeXml(item.status)}</status>`,
    `      <title>${escapeXml(item.title)}</title>`,
    ...(item.assigneeSessionID ? [`      <assignee>${escapeXml(item.assigneeSessionID)}</assignee>`] : []),
    `      <body>${escapeXml(clip(item.body))}</body>`,
    "    </item>",
  ]
}

export function render(input: { swarmID: string; items: ReadonlyArray<Item>; messages: ReadonlyArray<Message> }) {
  const open = input.items.filter((item) => item.status !== "done").slice(0, MAX_ITEMS)
  return [
    "Shared swarm memory for this project.",
    "<swarm>",
    `  <id>${escapeXml(input.swarmID)}</id>`,
    "  <board>",
    ...(open.length === 0 ? ["    (no open items)"] : open.flatMap(renderItem)),
    "  </board>",
    "  <chat>",
    ...(input.messages.length === 0
      ? ["    (empty)"]
      : input.messages.map(
          (message) => `    <message from="${escapeXml(message.fromAgent)}">${escapeXml(clip(message.text))}</message>`,
        )),
    "  </chat>",
    "</swarm>",
  ].join("\n")
}
