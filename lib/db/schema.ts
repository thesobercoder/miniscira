import { relations } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core"

/* -------------------------------------------------------------------------- */
/*  better-auth core tables                                                   */
/*  Shapes match better-auth's expected Postgres schema (provider: "pg").     */
/*  Regenerate with `npx @better-auth/cli generate` if you add auth plugins.  */
/* -------------------------------------------------------------------------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
})

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
})

/* -------------------------------------------------------------------------- */
/*  Application tables: chats + persisted eve stream events                   */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Projects: group chats + docs under custom instructions                    */
/* -------------------------------------------------------------------------- */

export const project = pgTable(
  "project",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Untitled project"),
    // Custom instructions injected into every chat in this project.
    instructions: text("instructions"),
    // User-curated source links; passed to the agent as primary sources
    // (fetchable directly, or expandable via firecrawl_map).
    links: jsonb("links").$type<string[]>(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("project_user_id_idx").on(table.userId, table.updatedAt)]
)

export const chat = pgTable(
  "chat",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Optional project the chat belongs to, and the lookout that spawned it.
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "set null",
    }),
    lookoutId: uuid("lookout_id").references(() => lookout.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull().default("New research"),
    visibility: text("visibility").notNull().default("private"),
    // eve durable-session cursor, captured from the stream so the conversation
    // can be resumed and rehydrated after a reload.
    eveSessionId: text("eve_session_id"),
    continuationToken: text("continuation_token"),
    streamIndex: integer("stream_index").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("chat_user_id_idx").on(table.userId, table.updatedAt)]
)

export const chatEvent = pgTable(
  "chat_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    // Monotonic ordering of persisted eve stream events within a chat.
    seq: integer("seq").notNull(),
    event: jsonb("event").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  // Unique, not just indexed: `seq` orders the whole transcript, so two
  // concurrent flushes computing the same base `max(seq)` must collide loudly
  // (SQLSTATE 23505) instead of silently interleaving the replay. The events
  // route catches that and retries at a recomputed base.
  (table) => [
    uniqueIndex("chat_event_chat_id_seq_idx").on(table.chatId, table.seq),
  ]
)

/* -------------------------------------------------------------------------- */
/*  Memories: durable per-user facts the agent saves and recalls across chats */
/* -------------------------------------------------------------------------- */

export const memory = pgTable(
  "memory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("memory_user_id_idx").on(table.userId, table.createdAt)]
)

// Per-user personalization. One row per user (userId is the PK); the agent reads
// these off clientContext on every turn to adapt how it addresses and answers.
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // What the assistant should call the user.
  nickname: text("nickname"),
  // Standing "always follow" directives, like ChatGPT's custom instructions.
  instructions: text("instructions"),
  // Response tone preset: default | concise | detailed | friendly | professional.
  tone: text("tone").notNull().default("default"),
  // The user's own AI Gateway key, AES-256-GCM sealed (see lib/secret-box.ts).
  // Never leaves the server: the settings API returns only a masked hint, and
  // this column is the one place the plaintext can be recovered.
  gatewayKeyCipher: text("gateway_key_cipher"),
  // Last four characters, stored in the clear so the UI can say *which* key is
  // saved without the server ever having to decrypt one to render a page.
  gatewayKeyLast4: text("gateway_key_last4"),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
})

export type Memory = typeof memory.$inferSelect

/* -------------------------------------------------------------------------- */
/*  Documents: uploaded files indexed for semantic search (RAG)               */
/* -------------------------------------------------------------------------- */

export const document = pgTable(
  "document",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The chat it was sent in, and the index of the user turn it was attached to
    // (null while still staged in the composer). Search itself is user-scoped.
    chatId: uuid("chat_id").references(() => chat.id, { onDelete: "set null" }),
    // Optional project this document belongs to (a project knowledge base).
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "set null",
    }),
    messageIndex: integer("message_index"),
    // "document" (parsed + embedded for search) | "image" (sent to the model as vision input)
    kind: text("kind").notNull().default("document"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    blobUrl: text("blob_url").notNull(),
    size: integer("size").notNull().default(0),
    // processing | ready | error
    status: text("status").notNull().default("processing"),
    error: text("error"),
    chunkCount: integer("chunk_count").notNull().default(0),
    // The extracted text, cached at upload so search never re-downloads or
    // re-parses the blob. Also what makes a re-chunk possible after an extractor
    // upgrade — otherwise every improvement means refetching every file.
    content: text("content"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("document_user_id_idx").on(table.userId, table.createdAt)]
)

/**
 * NO LONGER WRITTEN TO. Retrieval moved to on-demand chunking of
 * `document.content` plus a cross-encoder rerank (see
 * `agent/tools/search_documents.ts`), so nothing embeds or reads these rows.
 *
 * Kept in the schema deliberately: removing it makes the next `drizzle-kit push`
 * offer to drop the table and its data. Drop it explicitly when you're satisfied
 * the new path is right — `drop table document_chunk` — and delete this block
 * in the same change.
 */
export const documentChunk = pgTable(
  "document_chunk",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => document.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    // openai/text-embedding-3-small → 1536 dimensions
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("document_chunk_user_idx").on(table.userId),
    // HNSW index for fast cosine-similarity search.
    index("document_chunk_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
)

/* -------------------------------------------------------------------------- */
/*  Lookouts: scheduled recurring research (QStash-driven)                     */
/* -------------------------------------------------------------------------- */

export const lookout = pgTable(
  "lookout",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => project.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    // Recurring lookouts: cron the QStash schedule fires on (null for one-time).
    cron: text("cron"),
    // One-time lookouts: the moment the delayed QStash message fires.
    runAt: timestamp("run_at"),
    timezone: text("timezone").notNull().default("UTC"),
    frequency: text("frequency").notNull().default("daily"), // daily | weekly | once
    status: text("status").notNull().default("active"), // active | paused | completed
    // Dispatcher state: when the lookout should next fire, and the lease that
    // stops overlapping dispatcher ticks from double-running it.
    nextRunAt: timestamp("next_run_at"),
    leasedUntil: timestamp("leased_until"),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("lookout_user_id_idx").on(table.userId, table.createdAt)]
)

/* -------------------------------------------------------------------------- */
/*  MCP servers: user-added remote tool servers (HTTP / SSE transports)       */
/* -------------------------------------------------------------------------- */

export const mcpServer = pgTable(
  "mcp_server",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    transport: text("transport").notNull().default("http"), // http | sse
    // Optional HTTP headers (e.g. Authorization) sent on every request.
    headers: jsonb("headers").$type<Record<string, string>>(),
    // OAuth 2.0 state for protected servers (MCP authorization flow):
    // dynamically-registered client, issued tokens, and transient PKCE/state.
    oauthClient: jsonb("oauth_client").$type<Record<string, unknown>>(),
    oauthTokens: jsonb("oauth_tokens").$type<Record<string, unknown>>(),
    oauthVerifier: text("oauth_verifier"),
    oauthState: text("oauth_state"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("mcp_server_user_id_idx").on(table.userId, table.createdAt)]
)

export const userRelations = relations(user, ({ many }) => ({
  chats: many(chat),
  documents: many(document),
  projects: many(project),
  lookouts: many(lookout),
  mcpServers: many(mcpServer),
}))

export const mcpServerRelations = relations(mcpServer, ({ one }) => ({
  user: one(user, { fields: [mcpServer.userId], references: [user.id] }),
}))

export const projectRelations = relations(project, ({ one, many }) => ({
  user: one(user, { fields: [project.userId], references: [user.id] }),
  chats: many(chat),
  documents: many(document),
  lookouts: many(lookout),
}))

export const lookoutRelations = relations(lookout, ({ one }) => ({
  user: one(user, { fields: [lookout.userId], references: [user.id] }),
  project: one(project, {
    fields: [lookout.projectId],
    references: [project.id],
  }),
}))

export const documentRelations = relations(document, ({ one, many }) => ({
  user: one(user, { fields: [document.userId], references: [user.id] }),
  chunks: many(documentChunk),
}))

export const documentChunkRelations = relations(documentChunk, ({ one }) => ({
  document: one(document, {
    fields: [documentChunk.documentId],
    references: [document.id],
  }),
}))

export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, { fields: [chat.userId], references: [user.id] }),
  project: one(project, { fields: [chat.projectId], references: [project.id] }),
  lookout: one(lookout, { fields: [chat.lookoutId], references: [lookout.id] }),
  events: many(chatEvent),
}))

export const chatEventRelations = relations(chatEvent, ({ one }) => ({
  chat: one(chat, { fields: [chatEvent.chatId], references: [chat.id] }),
}))

export type Chat = typeof chat.$inferSelect
export type ChatEvent = typeof chatEvent.$inferSelect
export type Document = typeof document.$inferSelect
export type DocumentChunk = typeof documentChunk.$inferSelect
export type Project = typeof project.$inferSelect
export type Lookout = typeof lookout.$inferSelect
export type McpServer = typeof mcpServer.$inferSelect
