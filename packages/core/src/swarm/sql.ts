import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../database/schema.sql"
import type { SessionID } from "@opencode-ai/schema/session-id"
import type { Swarm } from "@opencode-ai/schema/swarm"

export const SwarmMessageTable = sqliteTable(
  "swarm_message",
  {
    id: text().$type<Swarm.MessageID>().primaryKey(),
    swarm_id: text().$type<Swarm.ID>().notNull(),
    from_session_id: text().$type<SessionID>().notNull(),
    to_session_id: text().$type<SessionID>(),
    from_agent: text().notNull(),
    text: text().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("swarm_message_swarm_time_idx").on(table.swarm_id, table.time_created),
    index("swarm_message_swarm_to_time_idx").on(table.swarm_id, table.to_session_id, table.time_created),
  ],
)

export const SwarmBoardTable = sqliteTable(
  "swarm_board",
  {
    id: text().$type<Swarm.BoardItemID>().primaryKey(),
    swarm_id: text().$type<Swarm.ID>().notNull(),
    kind: text().$type<Swarm.BoardKind>().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    status: text().$type<Swarm.BoardStatus>().notNull(),
    assignee_session_id: text().$type<SessionID>(),
    created_by_session_id: text().$type<SessionID>().notNull(),
    last_nudged_at: integer(),
    ...Timestamps,
  },
  (table) => [index("swarm_board_swarm_kind_status_idx").on(table.swarm_id, table.kind, table.status)],
)

export const SwarmRAGTable = sqliteTable(
  "swarm_rag",
  {
    id: text().$type<Swarm.RAGChunkID>().primaryKey(),
    swarm_id: text().$type<Swarm.ID>().notNull(),
    path: text().notNull(),
    chunk_index: integer().notNull(),
    text: text().notNull(),
    embedding: text({ mode: "json" }).$type<number[]>().notNull(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [index("swarm_rag_swarm_path_idx").on(table.swarm_id, table.path)],
)
