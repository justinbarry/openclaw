import {
  type Block,
  type FilesUploadV2Arguments,
  type KnownBlock,
  type WebClient,
} from "@slack/web-api";
import {
  chunkMarkdownTextWithMode,
  resolveChunkMode,
  resolveTextChunkLimit,
} from "../auto-reply/chunk.js";
import { loadConfig } from "../config/config.js";
import { resolveMarkdownTableMode } from "../config/markdown-tables.js";
import { logVerbose } from "../globals.js";
import { loadWebMedia } from "../web/media.js";
import type { SlackTokenSource } from "./accounts.js";
import { resolveSlackAccount } from "./accounts.js";
import { buildSlackBlocksFallbackText } from "./blocks-fallback.js";
import { validateSlackBlocksArray } from "./blocks-input.js";
import { createSlackWebClient } from "./client.js";
import { markdownToSlackMrkdwnChunks } from "./format.js";
import { extractSlackTableBlock } from "./table-blocks.js";
import { parseSlackTarget } from "./targets.js";
import { resolveSlackBotToken } from "./token.js";
import { buildLinearWorkObjects, type WorkObjectMetadata } from "./work-objects.js";

const SLACK_TEXT_LIMIT = 4000;

type SlackRecipient =
  | {
      kind: "user";
      id: string;
    }
  | {
      kind: "channel";
      id: string;
    };

export type SlackSendIdentity = {
  username?: string;
  iconUrl?: string;
  iconEmoji?: string;
};

type SlackSendOpts = {
  token?: string;
  accountId?: string;
  mediaUrl?: string;
  mediaLocalRoots?: readonly string[];
  client?: WebClient;
  threadTs?: string;
  identity?: SlackSendIdentity;
  blocks?: (Block | KnownBlock)[];
};

function hasCustomIdentity(identity?: SlackSendIdentity): boolean {
  return Boolean(identity?.username || identity?.iconUrl || identity?.iconEmoji);
}

function isSlackCustomizeScopeError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const maybeData = err as Error & {
    data?: {
      error?: string;
      needed?: string;
      response_metadata?: { scopes?: string[]; acceptedScopes?: string[] };
    };
  };
  const code = maybeData.data?.error?.toLowerCase();
  if (code !== "missing_scope") {
    return false;
  }
  const needed = maybeData.data?.needed?.toLowerCase();
  if (needed?.includes("chat:write.customize")) {
    return true;
  }
  const scopes = [
    ...(maybeData.data?.response_metadata?.scopes ?? []),
    ...(maybeData.data?.response_metadata?.acceptedScopes ?? []),
  ].map((scope) => scope.toLowerCase());
  return scopes.includes("chat:write.customize");
}

async function postSlackMessageBestEffort(params: {
  client: WebClient;
  channelId: string;
  text: string;
  threadTs?: string;
  identity?: SlackSendIdentity;
  blocks?: (Block | KnownBlock)[];
  workObjectMetadata?: WorkObjectMetadata;
}) {
  const basePayload = {
    channel: params.channelId,
    text: params.text,
    thread_ts: params.threadTs,
    ...(params.blocks?.length ? { blocks: params.blocks } : {}),
  };
  // Work Object metadata is not yet in the SDK types, so we merge it
  // into a separate payload for apiCall when present.
  // Pass metadata as a JSON string — Slack expects a URL-encoded JSON string
  // for the metadata parameter. The apiCall path sends it as-is.
  const workObjectExtra = params.workObjectMetadata ? { metadata: params.workObjectMetadata } : {};
  try {
    // Slack Web API types model icon_url and icon_emoji as mutually exclusive.
    // Build payloads in explicit branches so TS and runtime stay aligned.
    const identityPayload = params.identity?.iconUrl
      ? {
          ...(params.identity.username ? { username: params.identity.username } : {}),
          icon_url: params.identity.iconUrl,
        }
      : params.identity?.iconEmoji
        ? {
            ...(params.identity.username ? { username: params.identity.username } : {}),
            icon_emoji: params.identity.iconEmoji,
          }
        : params.identity?.username
          ? { username: params.identity.username }
          : {};

    // When Work Object metadata is present, use apiCall to pass the
    // metadata field which isn't in the SDK types yet.
    if (params.workObjectMetadata) {
      return (await params.client.apiCall("chat.postMessage", {
        ...basePayload,
        ...identityPayload,
        ...workObjectExtra,
      })) as Awaited<ReturnType<WebClient["chat"]["postMessage"]>>;
    }

    if (params.identity?.iconUrl) {
      return await params.client.chat.postMessage({
        ...basePayload,
        ...(params.identity.username ? { username: params.identity.username } : {}),
        icon_url: params.identity.iconUrl,
      });
    }
    if (params.identity?.iconEmoji) {
      return await params.client.chat.postMessage({
        ...basePayload,
        ...(params.identity.username ? { username: params.identity.username } : {}),
        icon_emoji: params.identity.iconEmoji,
      });
    }
    return await params.client.chat.postMessage({
      ...basePayload,
      ...(params.identity?.username ? { username: params.identity.username } : {}),
    });
  } catch (err) {
    if (!hasCustomIdentity(params.identity) || !isSlackCustomizeScopeError(err)) {
      throw err;
    }
    logVerbose("slack send: missing chat:write.customize, retrying without custom identity");
    return params.client.chat.postMessage(basePayload);
  }
}

export type SlackSendResult = {
  messageId: string;
  channelId: string;
};

function resolveToken(params: {
  explicit?: string;
  accountId: string;
  fallbackToken?: string;
  fallbackSource?: SlackTokenSource;
}) {
  const explicit = resolveSlackBotToken(params.explicit);
  if (explicit) {
    return explicit;
  }
  const fallback = resolveSlackBotToken(params.fallbackToken);
  if (!fallback) {
    logVerbose(
      `slack send: missing bot token for account=${params.accountId} explicit=${Boolean(
        params.explicit,
      )} source=${params.fallbackSource ?? "unknown"}`,
    );
    throw new Error(
      `Slack bot token missing for account "${params.accountId}" (set channels.slack.accounts.${params.accountId}.botToken or SLACK_BOT_TOKEN for default).`,
    );
  }
  return fallback;
}

function parseRecipient(raw: string): SlackRecipient {
  const target = parseSlackTarget(raw);
  if (!target) {
    throw new Error("Recipient is required for Slack sends");
  }
  return { kind: target.kind, id: target.id };
}

async function resolveChannelId(
  client: WebClient,
  recipient: SlackRecipient,
): Promise<{ channelId: string; isDm?: boolean }> {
  if (recipient.kind === "channel") {
    return { channelId: recipient.id };
  }
  const response = await client.conversations.open({ users: recipient.id });
  const channelId = response.channel?.id;
  if (!channelId) {
    throw new Error("Failed to open Slack DM channel");
  }
  return { channelId, isDm: true };
}

async function uploadSlackFile(params: {
  client: WebClient;
  channelId: string;
  mediaUrl: string;
  mediaLocalRoots?: readonly string[];
  caption?: string;
  threadTs?: string;
  maxBytes?: number;
}): Promise<string> {
  const {
    buffer,
    contentType: _contentType,
    fileName,
  } = await loadWebMedia(params.mediaUrl, {
    maxBytes: params.maxBytes,
    localRoots: params.mediaLocalRoots,
  });
  const basePayload = {
    channel_id: params.channelId,
    file: buffer,
    filename: fileName,
    ...(params.caption ? { initial_comment: params.caption } : {}),
    // Note: filetype is deprecated in files.uploadV2, Slack auto-detects from file content
  };
  const payload: FilesUploadV2Arguments = params.threadTs
    ? { ...basePayload, thread_ts: params.threadTs }
    : basePayload;
  const response = await params.client.files.uploadV2(payload);
  const parsed = response as {
    files?: Array<{ id?: string; name?: string }>;
    file?: { id?: string; name?: string };
  };
  const fileId =
    parsed.files?.[0]?.id ??
    parsed.file?.id ??
    parsed.files?.[0]?.name ??
    parsed.file?.name ??
    "unknown";
  return fileId;
}

export async function sendMessageSlack(
  to: string,
  message: string,
  opts: SlackSendOpts = {},
): Promise<SlackSendResult> {
  const trimmedMessage = message?.trim() ?? "";
  const blocks = opts.blocks == null ? undefined : validateSlackBlocksArray(opts.blocks);
  if (!trimmedMessage && !opts.mediaUrl && !blocks) {
    throw new Error("Slack send requires text, blocks, or media");
  }
  const cfg = loadConfig();
  const account = resolveSlackAccount({
    cfg,
    accountId: opts.accountId,
  });
  const token = resolveToken({
    explicit: opts.token,
    accountId: account.accountId,
    fallbackToken: account.botToken,
    fallbackSource: account.botTokenSource,
  });
  const client = opts.client ?? createSlackWebClient(token);
  const recipient = parseRecipient(to);
  const { channelId } = await resolveChannelId(client, recipient);
  if (blocks) {
    if (opts.mediaUrl) {
      throw new Error("Slack send does not support blocks with mediaUrl");
    }
    const fallbackText = trimmedMessage || buildSlackBlocksFallbackText(blocks);
    const response = await postSlackMessageBestEffort({
      client,
      channelId,
      text: fallbackText,
      threadTs: opts.threadTs,
      identity: opts.identity,
      blocks,
    });
    return {
      messageId: response.ts ?? "unknown",
      channelId,
    };
  }
  const textLimit = resolveTextChunkLimit(cfg, "slack", account.accountId);
  const chunkLimit = Math.min(textLimit, SLACK_TEXT_LIMIT);
  const tableMode = resolveMarkdownTableMode({
    cfg,
    channel: "slack",
    accountId: account.accountId,
  });

  // For slack-blocks mode: extract the first table as a Block Kit table block,
  // then render the remaining text normally (falling back to "code" for any
  // additional tables that couldn't become blocks).
  let tableBlock: KnownBlock | undefined;
  let messageForChunking = trimmedMessage;
  if (tableMode === "slack-blocks") {
    const extraction = extractSlackTableBlock(trimmedMessage);
    if (extraction.tableBlock) {
      tableBlock = extraction.tableBlock;
      messageForChunking = extraction.text;
    }
  }

  // Use "code" as fallback for any remaining tables (only relevant if
  // slack-blocks extracted one and there are more, or if mode isn't slack-blocks).
  const effectiveTableMode = tableMode === "slack-blocks" ? "code" : tableMode;

  const chunkMode = resolveChunkMode(cfg, "slack", account.accountId);
  const markdownChunks =
    chunkMode === "newline"
      ? chunkMarkdownTextWithMode(messageForChunking, chunkLimit, chunkMode)
      : [messageForChunking];
  const chunks = markdownChunks.flatMap((markdown) =>
    markdownToSlackMrkdwnChunks(markdown, chunkLimit, { tableMode: effectiveTableMode }),
  );
  if (!chunks.length && messageForChunking) {
    chunks.push(messageForChunking);
  }
  const mediaMaxBytes =
    typeof account.config.mediaMaxMb === "number"
      ? account.config.mediaMaxMb * 1024 * 1024
      : undefined;

  // Build Work Object metadata for any Linear ticket identifiers in the message.
  // This runs async but is fast (cached after first fetch) and only fires when
  // LINEAR_API_KEY is set.
  const workObjects =
    tableMode === "slack-blocks"
      ? await buildLinearWorkObjects(trimmedMessage).catch(() => null)
      : null;

  let lastMessageId = "";
  if (opts.mediaUrl) {
    const [firstChunk, ...rest] = chunks;
    lastMessageId = await uploadSlackFile({
      client,
      channelId,
      mediaUrl: opts.mediaUrl,
      mediaLocalRoots: opts.mediaLocalRoots,
      caption: firstChunk,
      threadTs: opts.threadTs,
      maxBytes: mediaMaxBytes,
    });
    for (const chunk of rest) {
      const response = await postSlackMessageBestEffort({
        client,
        channelId,
        text: chunk,
        threadTs: opts.threadTs,
        identity: opts.identity,
      });
      lastMessageId = response.ts ?? lastMessageId;
    }
    // Send table block as a follow-up if we had media
    if (tableBlock) {
      const response = await postSlackMessageBestEffort({
        client,
        channelId,
        text: " ",
        threadTs: opts.threadTs,
        identity: opts.identity,
        blocks: [tableBlock],
        workObjectMetadata: workObjects ?? undefined,
      });
      lastMessageId = response.ts ?? lastMessageId;
    } else if (workObjects) {
      // No table block but we have work objects — post them on a minimal message
      const response = await postSlackMessageBestEffort({
        client,
        channelId,
        text: " ",
        threadTs: opts.threadTs,
        identity: opts.identity,
        workObjectMetadata: workObjects,
      });
      lastMessageId = response.ts ?? lastMessageId;
    }
  } else {
    // Send text chunks; attach the table block and work objects to the last message.
    const chunkList = chunks.length ? chunks : [""];
    for (let i = 0; i < chunkList.length; i++) {
      const isLast = i === chunkList.length - 1;
      const response = await postSlackMessageBestEffort({
        client,
        channelId,
        text: chunkList[i],
        threadTs: opts.threadTs,
        identity: opts.identity,
        blocks: isLast && tableBlock ? [tableBlock] : undefined,
        workObjectMetadata: isLast ? (workObjects ?? undefined) : undefined,
      });
      lastMessageId = response.ts ?? lastMessageId;
    }
  }

  return {
    messageId: lastMessageId || "unknown",
    channelId,
  };
}
