import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

/**
 * $1 repost requests. One row per paid `request_repost` call.
 * `tx_hash` is UNIQUE → replay protection (a settled payment can't be reused).
 */
export const repostRequests = pgTable('repost_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  payerWallet: text('payer_wallet'),
  tweetUrl: text('tweet_url').notNull(),
  tweetId: text('tweet_id').notNull(),
  tweetTextSnapshot: text('tweet_text_snapshot'),
  screenDecision: text('screen_decision'), // 'pass' | 'fail'
  screenReason: text('screen_reason'),
  screenConfidence: doublePrecision('screen_confidence'),
  screenModel: text('screen_model'),
  reposted: boolean('reposted').notNull().default(false),
  repostTweetId: text('repost_tweet_id'),
  // 'auto' | 'pending_approval' | 'approved' | 'rejected' — fulfillment state
  status: text('status').notNull().default('auto'),
  txHash: text('tx_hash').notNull().unique(),
  amountUsdc: doublePrecision('amount_usdc').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * $5 network-introduction requests. Fulfilled manually on merit.
 */
export const introRequests = pgTable('intro_requests', {
  id: uuid('id').defaultRandom().primaryKey(),
  payerWallet: text('payer_wallet'),
  projectName: text('project_name').notNull(),
  category: text('category').notNull(),
  contact: text('contact').notNull(),
  pitch: text('pitch').notNull(),
  links: jsonb('links').$type<string[]>(),
  status: text('status').notNull().default('pending'), // pending | contacted | declined
  txHash: text('tx_hash').notNull().unique(),
  amountUsdc: doublePrecision('amount_usdc').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Lightweight audit log of every MCP tool invocation outcome.
 */
export const mcpEvents = pgTable('mcp_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  tool: text('tool').notNull(),
  ip: text('ip'),
  payerWallet: text('payer_wallet'),
  outcome: text('outcome').notNull(), // ok | payment_required | payment_failed | screen_failed | error
  detail: text('detail'),
  httpStatus: integer('http_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type RepostRequest = typeof repostRequests.$inferSelect;
export type IntroRequest = typeof introRequests.$inferSelect;
export type McpEvent = typeof mcpEvents.$inferSelect;
