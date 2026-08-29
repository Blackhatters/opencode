import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20260829003554_swarm_tables",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`swarm_board\` (
          \`id\` text PRIMARY KEY,
          \`swarm_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`title\` text NOT NULL,
          \`body\` text NOT NULL,
          \`status\` text NOT NULL,
          \`assignee_session_id\` text,
          \`created_by_session_id\` text NOT NULL,
          \`last_nudged_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`swarm_message\` (
          \`id\` text PRIMARY KEY,
          \`swarm_id\` text NOT NULL,
          \`from_session_id\` text NOT NULL,
          \`to_session_id\` text,
          \`from_agent\` text NOT NULL,
          \`text\` text NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`swarm_rag\` (
          \`id\` text PRIMARY KEY,
          \`swarm_id\` text NOT NULL,
          \`path\` text NOT NULL,
          \`chunk_index\` integer NOT NULL,
          \`text\` text NOT NULL,
          \`embedding\` text NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`swarm_board_swarm_kind_status_idx\` ON \`swarm_board\` (\`swarm_id\`,\`kind\`,\`status\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`swarm_message_swarm_time_idx\` ON \`swarm_message\` (\`swarm_id\`,\`time_created\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`swarm_message_swarm_to_time_idx\` ON \`swarm_message\` (\`swarm_id\`,\`to_session_id\`,\`time_created\`);`,
      )
      yield* tx.run(`CREATE INDEX \`swarm_rag_swarm_path_idx\` ON \`swarm_rag\` (\`swarm_id\`,\`path\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
