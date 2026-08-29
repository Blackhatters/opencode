export * as ConfigSwarm from "./swarm"

import { Schema } from "effect"

export class Info extends Schema.Class<Info>("Config.Swarm")({
  enabled: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Enable the autonomous agent swarm: communication tools, shared board, RAG, and idle watchdog",
  }),
  id: Schema.String.pipe(Schema.optional).annotate({
    description: "Stable swarm identifier. Defaults to the current project ID when omitted",
  }),
  infinite_permissions: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Bypass parent deny rules when spawning swarm agents so each agent keeps unrestricted tool access",
  }),
}) {}
