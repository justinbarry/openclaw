/**
 * Slack Work Objects for Linear tickets in bot responses.
 *
 * When the bot posts a message mentioning Linear ticket identifiers (e.g. ENG-1475),
 * this module fetches ticket data from the Linear API and attaches Work Object
 * metadata to the Slack message for rich rendering.
 *
 * Requires:
 * - `LINEAR_API_KEY` environment variable
 * - "Work Object Previews" enabled on the Slack app with Task entity type
 */

import { logVerbose } from "../globals.js";

// ---------------------------------------------------------------------------
// Linear API
// ---------------------------------------------------------------------------

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  priorityLabel: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  state: { name: string; color: string; type: string } | null;
  assignee: { name: string; email?: string } | null;
  project: { name: string } | null;
};

// Valid Slack tag_color values: red, yellow, green, gray, blue
const STATE_TYPE_COLORS: Record<string, string> = {
  backlog: "gray",
  unstarted: "blue",
  started: "yellow",
  completed: "green",
  cancelled: "red",
  triage: "blue",
};

const PRIORITY_COLORS: Record<number, string> = {
  0: "gray", // No priority
  1: "red", // Urgent
  2: "red", // High
  3: "yellow", // Medium
  4: "blue", // Low
};

// Simple in-memory cache to avoid re-fetching the same ticket within a message
const issueCache = new Map<string, { issue: LinearIssue | null; ts: number }>();
const CACHE_TTL_MS = 60_000;

async function fetchLinearIssue(identifier: string, apiKey: string): Promise<LinearIssue | null> {
  const cached = issueCache.get(identifier);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.issue;
  }

  const query = `
    query IssueByIdentifier($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        priority
        priorityLabel
        createdAt
        updatedAt
        url
        state { name color type }
        assignee { name email }
        project { name }
      }
    }
  `;

  try {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables: { id: identifier } }),
    });

    if (!response.ok) {
      logVerbose(`work-objects: Linear API ${response.status}`);
      issueCache.set(identifier, { issue: null, ts: Date.now() });
      return null;
    }

    const data = (await response.json()) as {
      data?: { issue?: LinearIssue };
    };
    const issue = data.data?.issue ?? null;
    issueCache.set(identifier, { issue, ts: Date.now() });
    return issue;
  } catch (err) {
    logVerbose(`work-objects: Linear fetch error: ${String(err)}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Identifier extraction
// ---------------------------------------------------------------------------

/** Match Linear-style identifiers: ABC-123 */
const IDENTIFIER_RE = /\b([A-Z]{2,10}-\d{1,6})\b/g;

function extractIdentifiers(text: string): string[] {
  const matches = new Set<string>();
  let match: RegExpExecArray | null;
  IDENTIFIER_RE.lastIndex = 0;
  while ((match = IDENTIFIER_RE.exec(text)) !== null) {
    matches.add(match[1]);
  }
  return [...matches];
}

// ---------------------------------------------------------------------------
// Work Object entity builder
// ---------------------------------------------------------------------------

function buildTaskEntity(issue: LinearIssue) {
  const stateColor = STATE_TYPE_COLORS[issue.state?.type ?? ""] ?? "grey";
  const priorityColor = PRIORITY_COLORS[issue.priority] ?? "grey";

  const fields: Record<string, unknown> = {
    description: {
      value: issue.description?.slice(0, 500) ?? "",
      format: "markdown",
    },
    status: {
      value: issue.state?.name ?? "Unknown",
      tag_color: stateColor,
      link: issue.url,
    },
    priority: {
      value: issue.priorityLabel || "No priority",
      tag_color: priorityColor,
    },
    date_created: {
      value: Math.floor(new Date(issue.createdAt).getTime() / 1000),
    },
    date_updated: {
      value: Math.floor(new Date(issue.updatedAt).getTime() / 1000),
    },
  };

  if (issue.assignee) {
    fields.assignee = {
      user: {
        text: issue.assignee.name,
        ...(issue.assignee.email ? { email: issue.assignee.email } : {}),
      },
      type: "slack#/types/user",
    };
  }

  return {
    url: issue.url,
    external_ref: {
      id: issue.id,
      type: "issue",
    },
    entity_type: "slack#/entities/task",
    entity_payload: {
      attributes: {
        title: { text: `${issue.identifier}: ${issue.title}` },
        display_id: issue.identifier,
        display_type: "Issue",
        product_name: "Linear",
        metadata_last_modified: Math.floor(new Date(issue.updatedAt).getTime() / 1000),
      },
      fields,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type WorkObjectMetadata = {
  entities: Array<Record<string, unknown>>;
};

/**
 * Scan message text for Linear ticket identifiers and build Work Object
 * metadata for up to `limit` tickets. Returns null if no tickets found
 * or LINEAR_API_KEY is not set.
 */
export async function buildLinearWorkObjects(
  text: string,
  options?: { limit?: number },
): Promise<WorkObjectMetadata | null> {
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const identifiers = extractIdentifiers(text);
  if (identifiers.length === 0) {
    return null;
  }

  const limit = options?.limit ?? 5;
  const toFetch = identifiers.slice(0, limit);

  const entities: Array<Record<string, unknown>> = [];
  for (const id of toFetch) {
    const issue = await fetchLinearIssue(id, apiKey);
    if (issue) {
      entities.push(buildTaskEntity(issue));
    }
  }

  if (entities.length === 0) {
    return null;
  }

  logVerbose(
    `work-objects: built ${entities.length} Linear task entit${entities.length === 1 ? "y" : "ies"}`,
  );
  return { entities };
}
