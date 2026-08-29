import { Effect } from "effect"
import { Swarm } from "@opencode-ai/schema/swarm"
import { effectCmd } from "../effect-cmd"
import { SwarmView } from "@/swarm/view"
import { SwarmVault } from "@/swarm/vault"

const sections = ["board", "chat", "dm"] as const

const SwarmExportCommand = effectCmd({
  command: "export [directory]",
  describe: "write the RAG index as an Obsidian vault",
  builder: (yargs) =>
    yargs
      .positional("directory", {
        describe: "vault directory (default: .opencode/swarm-rag)",
        type: "string",
      })
      .option("reindex", {
        type: "boolean",
        describe: "rebuild the RAG index from the workspace before exporting",
      })
      .option("id", {
        describe: "swarm ID (defaults to configured or project ID)",
        type: "string",
      }),
  handler: Effect.fn("Cli.swarm.export")(function* (args) {
    const result = yield* SwarmVault.write({
      ...(args.directory ? { directory: args.directory } : {}),
      ...(args.id ? { swarmID: args.id } : {}),
      ...(args.reindex ? { reindex: true } : {}),
    })
    console.log(`Wrote ${result.files} notes (${result.chunks} chunks) to ${result.directory}`)
    console.log("Open that folder as a vault in Obsidian.")
  }),
})

export const SwarmCommand = effectCmd({
  command: "swarm [section]",
  describe: "view the swarm board, messages, and RAG",
  builder: (yargs) =>
    yargs
      .command(SwarmExportCommand)
      .positional("section", {
        describe: "board, chat, or dm; omit to show everything",
        type: "string",
        choices: sections,
      })
      .option("format", {
        describe: "output format",
        type: "string",
        choices: ["table", "json"],
        default: "table",
      })
      .option("limit", {
        alias: "n",
        describe: "maximum chat and DM messages to show",
        type: "number",
      })
      .option("kind", {
        describe: "filter board items by kind",
        type: "string",
        choices: ["goal", "task", "note"],
      })
      .option("status", {
        describe: "filter board items by status",
        type: "string",
        choices: ["open", "in_progress", "done", "blocked"],
      })
      .option("session", {
        describe: "filter DMs involving this session ID",
        type: "string",
      })
      .option("id", {
        describe: "swarm ID (defaults to configured or project ID)",
        type: "string",
      }),
  handler: Effect.fn("Cli.swarm")(function* (args) {
    const snapshot = yield* SwarmView.load({
      ...(args.id ? { swarmID: args.id } : {}),
      ...(args.limit ? { limit: args.limit } : {}),
      ...(args.kind ? { kind: args.kind as Swarm.BoardKind } : {}),
      ...(args.status ? { status: args.status as Swarm.BoardStatus } : {}),
      ...(args.session ? { sessionID: args.session } : {}),
    })
    if (args.format === "json") {
      const section = args.section as SwarmView.Section | undefined
      if (!section) {
        console.log(JSON.stringify(snapshot, null, 2))
        return
      }
      console.log(
        JSON.stringify(
          {
            swarmID: snapshot.swarmID,
            enabled: snapshot.enabled,
            [section]: snapshot[section],
          },
          null,
          2,
        ),
      )
      return
    }
    console.log(SwarmView.format(snapshot, args.section as SwarmView.Section | undefined))
  }),
})
