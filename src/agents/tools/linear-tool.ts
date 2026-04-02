import { Type } from "@sinclair/typebox";
import { optionalStringEnum, stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

const LINEAR_API_URL = "https://api.linear.app/graphql";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env["LINEAR_API_KEY"]?.trim();
  if (!key) {
    throw new Error(
      "LINEAR_API_KEY is not configured. Set it via: openclaw config set env.LINEAR_API_KEY <key>",
    );
  }
  return key;
}

async function linearGraphQL(
  query: string,
  variables: Record<string, unknown> = {},
  apiKey: string,
): Promise<unknown> {
  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`Linear API HTTP error ${response.status}: ${await response.text()}`);
  }
  const json = (await response.json()) as { data?: unknown; errors?: unknown };
  if (json.errors) {
    throw new Error(`Linear API errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// ---------------------------------------------------------------------------
// linear_team — list teams and their workflow states
// ---------------------------------------------------------------------------

const LINEAR_TEAM_ACTIONS = ["list", "states"] as const;

const LinearTeamSchema = Type.Object(
  {
    action: stringEnum(LINEAR_TEAM_ACTIONS, {
      description: "list: all teams; states: workflow states for a team",
    }),
    teamId: Type.Optional(Type.String({ description: "Team ID (required for states)" })),
  },
  { additionalProperties: true },
);

export function createLinearTeamTool(): AnyAgentTool {
  return {
    name: "linear_team",
    label: "linear_team",
    description: "List Linear teams or fetch workflow states for a team.",
    parameters: LinearTeamSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const apiKey = resolveApiKey();

      if (action === "list") {
        const data = (await linearGraphQL(
          `{ teams { nodes { id name key description } } }`,
          {},
          apiKey,
        )) as { teams: { nodes: unknown[] } };
        return jsonResult(data.teams.nodes);
      }

      if (action === "states") {
        const teamId = readStringParam(params, "teamId", { required: true });
        const data = (await linearGraphQL(
          `query TeamStates($teamId: String!) { team(id: $teamId) { states { nodes { id name type color position } } } }`,
          { teamId },
          apiKey,
        )) as { team: { states: { nodes: unknown[] } } };
        return jsonResult(data.team.states.nodes);
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_issue — CRUD for issues
// ---------------------------------------------------------------------------

const LINEAR_ISSUE_ACTIONS = ["get", "list", "create", "update", "archive"] as const;
const LINEAR_ISSUE_PRIORITIES = ["0", "1", "2", "3", "4"] as const; // 0=no priority,1=urgent,2=high,3=medium,4=low

const LinearIssueSchema = Type.Object(
  {
    action: stringEnum(LINEAR_ISSUE_ACTIONS, {
      description:
        "get: fetch one issue; list: search/filter; create: new issue; update: patch; archive: soft-delete",
    }),
    issueId: Type.Optional(Type.String({ description: "Issue ID (for get/update/archive)" })),
    teamId: Type.Optional(
      Type.String({ description: "Team ID (required for create, optional filter for list)" }),
    ),
    title: Type.Optional(Type.String({ description: "Issue title" })),
    description: Type.Optional(Type.String({ description: "Issue description (markdown)" })),
    stateId: Type.Optional(Type.String({ description: "Workflow state ID" })),
    assigneeId: Type.Optional(Type.String({ description: "Assignee user ID" })),
    priority: optionalStringEnum(LINEAR_ISSUE_PRIORITIES, {
      description: "Priority: 0=none 1=urgent 2=high 3=medium 4=low",
    }),
    labelIds: Type.Optional(Type.Array(Type.String(), { description: "Label IDs to attach" })),
    cycleId: Type.Optional(Type.String({ description: "Cycle ID to add issue to" })),
    projectId: Type.Optional(Type.String({ description: "Project ID" })),
    query: Type.Optional(Type.String({ description: "Search query string (for list)" })),
    limit: Type.Optional(Type.Number({ description: "Max results (list, default 25)" })),
    includeArchived: Type.Optional(
      Type.Boolean({ description: "Include archived issues in list" }),
    ),
  },
  { additionalProperties: true },
);

const ISSUE_FIELDS = `
  id identifier title description priority state { id name type } assignee { id name email }
  team { id name key } project { id name } cycle { id name } labels { nodes { id name } }
  createdAt updatedAt url
`;

export function createLinearIssueTool(): AnyAgentTool {
  return {
    name: "linear_issue",
    label: "linear_issue",
    description:
      "Create, read, update, or archive Linear issues. Use list to search by team/query, get for a single issue, create/update/archive for mutations.",
    parameters: LinearIssueSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const apiKey = resolveApiKey();

      if (action === "get") {
        const issueId = readStringParam(params, "issueId", { required: true });
        const data = (await linearGraphQL(
          `query Issue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`,
          { id: issueId },
          apiKey,
        )) as { issue: unknown };
        return jsonResult(data.issue);
      }

      if (action === "list") {
        const limit = typeof params["limit"] === "number" ? params["limit"] : 25;
        const teamId = readStringParam(params, "teamId", { required: false });
        const query = readStringParam(params, "query", { required: false });
        // Use search endpoint when a query string is provided
        if (query) {
          const data = (await linearGraphQL(
            `query Search($term: String!, $first: Int) { issueSearch(query: $term, first: $first, includeArchived: false) { nodes { ${ISSUE_FIELDS} } } }`,
            { term: query, first: limit },
            apiKey,
          )) as { issueSearch: { nodes: unknown[] } };
          return jsonResult(data.issueSearch.nodes);
        }
        const filter: Record<string, unknown> = {};
        if (teamId) {
          filter["team"] = { id: { eq: teamId } };
        }
        const data = (await linearGraphQL(
          `query Issues($filter: IssueFilter, $first: Int, $includeArchived: Boolean) { issues(filter: $filter, first: $first, includeArchived: $includeArchived) { nodes { ${ISSUE_FIELDS} } } }`,
          {
            filter: Object.keys(filter).length ? filter : undefined,
            first: limit,
            includeArchived: params["includeArchived"] ?? false,
          },
          apiKey,
        )) as { issues: { nodes: unknown[] } };
        return jsonResult(data.issues.nodes);
      }

      if (action === "create") {
        const teamId = readStringParam(params, "teamId", { required: true });
        const title = readStringParam(params, "title", { required: true });
        const input: Record<string, unknown> = { teamId, title };
        const description = readStringParam(params, "description", { required: false });
        if (description) {
          input["description"] = description;
        }
        const stateId = readStringParam(params, "stateId", { required: false });
        if (stateId) {
          input["stateId"] = stateId;
        }
        const assigneeId = readStringParam(params, "assigneeId", { required: false });
        if (assigneeId) {
          input["assigneeId"] = assigneeId;
        }
        const priority = readStringParam(params, "priority", { required: false });
        if (priority) {
          input["priority"] = Number(priority);
        }
        const projectId = readStringParam(params, "projectId", { required: false });
        if (projectId) {
          input["projectId"] = projectId;
        }
        const cycleId = readStringParam(params, "cycleId", { required: false });
        if (cycleId) {
          input["cycleId"] = cycleId;
        }
        if (Array.isArray(params["labelIds"])) {
          input["labelIds"] = params["labelIds"];
        }
        const data = (await linearGraphQL(
          `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
          { input },
          apiKey,
        )) as { issueCreate: { success: boolean; issue: unknown } };
        return jsonResult(data.issueCreate);
      }

      if (action === "update") {
        const issueId = readStringParam(params, "issueId", { required: true });
        const input: Record<string, unknown> = {};
        const title = readStringParam(params, "title", { required: false });
        if (title) {
          input["title"] = title;
        }
        const description = readStringParam(params, "description", { required: false });
        if (description) {
          input["description"] = description;
        }
        const stateId = readStringParam(params, "stateId", { required: false });
        if (stateId) {
          input["stateId"] = stateId;
        }
        const assigneeId = readStringParam(params, "assigneeId", { required: false });
        if (assigneeId) {
          input["assigneeId"] = assigneeId;
        }
        const priority = readStringParam(params, "priority", { required: false });
        if (priority) {
          input["priority"] = Number(priority);
        }
        const projectId = readStringParam(params, "projectId", { required: false });
        if (projectId) {
          input["projectId"] = projectId;
        }
        const cycleId = readStringParam(params, "cycleId", { required: false });
        if (cycleId) {
          input["cycleId"] = cycleId;
        }
        if (Array.isArray(params["labelIds"])) {
          input["labelIds"] = params["labelIds"];
        }
        const data = (await linearGraphQL(
          `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ${ISSUE_FIELDS} } } }`,
          { id: issueId, input },
          apiKey,
        )) as { issueUpdate: { success: boolean; issue: unknown } };
        return jsonResult(data.issueUpdate);
      }

      if (action === "archive") {
        const issueId = readStringParam(params, "issueId", { required: true });
        const data = (await linearGraphQL(
          `mutation ArchiveIssue($id: String!) { issueArchive(id: $id) { success } }`,
          { id: issueId },
          apiKey,
        )) as { issueArchive: { success: boolean } };
        return jsonResult(data.issueArchive);
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_project — list/get/create/update projects
// ---------------------------------------------------------------------------

const LINEAR_PROJECT_ACTIONS = ["list", "get", "create", "update"] as const;

const LinearProjectSchema = Type.Object(
  {
    action: stringEnum(LINEAR_PROJECT_ACTIONS),
    projectId: Type.Optional(Type.String({ description: "Project ID (get/update)" })),
    teamIds: Type.Optional(
      Type.Array(Type.String(), { description: "Team IDs (required for create)" }),
    ),
    name: Type.Optional(Type.String({ description: "Project name" })),
    description: Type.Optional(Type.String()),
    state: Type.Optional(Type.String({ description: "Project state slug" })),
    limit: Type.Optional(Type.Number({ description: "Max results (list, default 25)" })),
  },
  { additionalProperties: true },
);

const PROJECT_FIELDS = `id name description state slugId url startDate targetDate createdAt updatedAt teams { nodes { id name key } }`;

export function createLinearProjectTool(): AnyAgentTool {
  return {
    name: "linear_project",
    label: "linear_project",
    description: "List, get, create, or update Linear projects.",
    parameters: LinearProjectSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const apiKey = resolveApiKey();

      if (action === "list") {
        const limit = typeof params["limit"] === "number" ? params["limit"] : 25;
        const data = (await linearGraphQL(
          `query Projects($first: Int) { projects(first: $first) { nodes { ${PROJECT_FIELDS} } } }`,
          { first: limit },
          apiKey,
        )) as { projects: { nodes: unknown[] } };
        return jsonResult(data.projects.nodes);
      }

      if (action === "get") {
        const projectId = readStringParam(params, "projectId", { required: true });
        const data = (await linearGraphQL(
          `query Project($id: String!) { project(id: $id) { ${PROJECT_FIELDS} issues { nodes { id identifier title state { name } } } } }`,
          { id: projectId },
          apiKey,
        )) as { project: unknown };
        return jsonResult(data.project);
      }

      if (action === "create") {
        const name = readStringParam(params, "name", { required: true });
        const teamIds = Array.isArray(params["teamIds"]) ? params["teamIds"] : [];
        if (!teamIds.length) {
          throw new Error("teamIds is required for project create");
        }
        const input: Record<string, unknown> = { name, teamIds };
        const description = readStringParam(params, "description", { required: false });
        if (description) {
          input["description"] = description;
        }
        const data = (await linearGraphQL(
          `mutation CreateProject($input: ProjectCreateInput!) { projectCreate(input: $input) { success project { ${PROJECT_FIELDS} } } }`,
          { input },
          apiKey,
        )) as { projectCreate: { success: boolean; project: unknown } };
        return jsonResult(data.projectCreate);
      }

      if (action === "update") {
        const projectId = readStringParam(params, "projectId", { required: true });
        const input: Record<string, unknown> = {};
        const name = readStringParam(params, "name", { required: false });
        if (name) {
          input["name"] = name;
        }
        const description = readStringParam(params, "description", { required: false });
        if (description) {
          input["description"] = description;
        }
        const state = readStringParam(params, "state", { required: false });
        if (state) {
          input["state"] = state;
        }
        const data = (await linearGraphQL(
          `mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) { projectUpdate(id: $id, input: $input) { success project { ${PROJECT_FIELDS} } } }`,
          { id: projectId, input },
          apiKey,
        )) as { projectUpdate: { success: boolean; project: unknown } };
        return jsonResult(data.projectUpdate);
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_comment — list/create/update/delete comments on issues
// ---------------------------------------------------------------------------

const LINEAR_COMMENT_ACTIONS = ["list", "create", "update", "delete"] as const;

const LinearCommentSchema = Type.Object(
  {
    action: stringEnum(LINEAR_COMMENT_ACTIONS),
    issueId: Type.Optional(Type.String({ description: "Issue ID (list/create)" })),
    commentId: Type.Optional(Type.String({ description: "Comment ID (update/delete)" })),
    body: Type.Optional(Type.String({ description: "Comment body (markdown)" })),
  },
  { additionalProperties: true },
);

const COMMENT_FIELDS = `id body createdAt updatedAt user { id name email } issue { id identifier title }`;

export function createLinearCommentTool(): AnyAgentTool {
  return {
    name: "linear_comment",
    label: "linear_comment",
    description: "List, create, update, or delete comments on Linear issues.",
    parameters: LinearCommentSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const apiKey = resolveApiKey();

      if (action === "list") {
        const issueId = readStringParam(params, "issueId", { required: true });
        const data = (await linearGraphQL(
          `query IssueComments($id: String!) { issue(id: $id) { comments { nodes { ${COMMENT_FIELDS} } } } }`,
          { id: issueId },
          apiKey,
        )) as { issue: { comments: { nodes: unknown[] } } };
        return jsonResult(data.issue.comments.nodes);
      }

      if (action === "create") {
        const issueId = readStringParam(params, "issueId", { required: true });
        const body = readStringParam(params, "body", { required: true });
        const data = (await linearGraphQL(
          `mutation CreateComment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { ${COMMENT_FIELDS} } } }`,
          { input: { issueId, body } },
          apiKey,
        )) as { commentCreate: { success: boolean; comment: unknown } };
        return jsonResult(data.commentCreate);
      }

      if (action === "update") {
        const commentId = readStringParam(params, "commentId", { required: true });
        const body = readStringParam(params, "body", { required: true });
        const data = (await linearGraphQL(
          `mutation UpdateComment($id: String!, $input: CommentUpdateInput!) { commentUpdate(id: $id, input: $input) { success comment { ${COMMENT_FIELDS} } } }`,
          { id: commentId, input: { body } },
          apiKey,
        )) as { commentUpdate: { success: boolean; comment: unknown } };
        return jsonResult(data.commentUpdate);
      }

      if (action === "delete") {
        const commentId = readStringParam(params, "commentId", { required: true });
        const data = (await linearGraphQL(
          `mutation DeleteComment($id: String!) { commentDelete(id: $id) { success } }`,
          { id: commentId },
          apiKey,
        )) as { commentDelete: { success: boolean } };
        return jsonResult(data.commentDelete);
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_queue — list/get cycles (sprints)
// ---------------------------------------------------------------------------

const LINEAR_QUEUE_ACTIONS = ["list", "get", "active"] as const;

const LinearQueueSchema = Type.Object(
  {
    action: stringEnum(LINEAR_QUEUE_ACTIONS, {
      description:
        "list: all cycles for a team; get: single cycle with issues; active: current active cycle",
    }),
    teamId: Type.Optional(Type.String({ description: "Team ID (required for list/active)" })),
    cycleId: Type.Optional(Type.String({ description: "Cycle ID (required for get)" })),
  },
  { additionalProperties: true },
);

const CYCLE_FIELDS = `id name number startsAt endsAt completedAt progress issues { nodes { id identifier title state { name } priority assignee { name } } }`;

export function createLinearQueueTool(): AnyAgentTool {
  return {
    name: "linear_queue",
    label: "linear_queue",
    description:
      "Inspect Linear cycles (sprints/queues): list cycles for a team, get a specific cycle with its issues, or fetch the active cycle.",
    parameters: LinearQueueSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const apiKey = resolveApiKey();

      if (action === "list") {
        const teamId = readStringParam(params, "teamId", { required: true });
        const data = (await linearGraphQL(
          `query TeamCycles($teamId: String!) { team(id: $teamId) { cycles { nodes { id name number startsAt endsAt completedAt progress } } } }`,
          { teamId },
          apiKey,
        )) as { team: { cycles: { nodes: unknown[] } } };
        return jsonResult(data.team.cycles.nodes);
      }

      if (action === "get") {
        const cycleId = readStringParam(params, "cycleId", { required: true });
        const data = (await linearGraphQL(
          `query Cycle($id: String!) { cycle(id: $id) { ${CYCLE_FIELDS} } }`,
          { id: cycleId },
          apiKey,
        )) as { cycle: unknown };
        return jsonResult(data.cycle);
      }

      if (action === "active") {
        const teamId = readStringParam(params, "teamId", { required: true });
        const data = (await linearGraphQL(
          `query ActiveCycle($teamId: String!) { team(id: $teamId) { activeCycle { ${CYCLE_FIELDS} } } }`,
          { teamId },
          apiKey,
        )) as { team: { activeCycle: unknown } };
        return jsonResult(data.team.activeCycle);
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_relation — manage issue relations (blocks/blocked-by/duplicate/related)
// ---------------------------------------------------------------------------

const LINEAR_RELATION_ACTIONS = ["list", "create", "delete"] as const;
const LINEAR_RELATION_TYPES = [
  "blocks",
  "blocked_by",
  "duplicate",
  "duplicate_of",
  "related",
] as const;

const LinearRelationSchema = Type.Object(
  {
    action: stringEnum(LINEAR_RELATION_ACTIONS),
    issueId: Type.Optional(Type.String({ description: "Source issue ID (list/create)" })),
    relatedIssueId: Type.Optional(Type.String({ description: "Target issue ID (create)" })),
    type: optionalStringEnum(LINEAR_RELATION_TYPES, { description: "Relation type" }),
    relationId: Type.Optional(Type.String({ description: "Relation ID (delete)" })),
  },
  { additionalProperties: true },
);

const RELATION_FIELDS = `id type relatedIssue { id identifier title state { name } }`;

export function createLinearRelationTool(): AnyAgentTool {
  return {
    name: "linear_relation",
    label: "linear_relation",
    description:
      "Manage relations between Linear issues: blocks, blocked_by, duplicate, duplicate_of, related.",
    parameters: LinearRelationSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const apiKey = resolveApiKey();

      if (action === "list") {
        const issueId = readStringParam(params, "issueId", { required: true });
        const data = (await linearGraphQL(
          `query IssueRelations($id: String!) { issue(id: $id) { relations { nodes { ${RELATION_FIELDS} } } } }`,
          { id: issueId },
          apiKey,
        )) as { issue: { relations: { nodes: unknown[] } } };
        return jsonResult(data.issue.relations.nodes);
      }

      if (action === "create") {
        const issueId = readStringParam(params, "issueId", { required: true });
        const relatedIssueId = readStringParam(params, "relatedIssueId", { required: true });
        const type = readStringParam(params, "type", { required: true });
        const data = (await linearGraphQL(
          `mutation CreateRelation($input: IssueRelationCreateInput!) { issueRelationCreate(input: $input) { success issueRelation { ${RELATION_FIELDS} } } }`,
          { input: { issueId, relatedIssueId, type } },
          apiKey,
        )) as { issueRelationCreate: { success: boolean; issueRelation: unknown } };
        return jsonResult(data.issueRelationCreate);
      }

      if (action === "delete") {
        const relationId = readStringParam(params, "relationId", { required: true });
        const data = (await linearGraphQL(
          `mutation DeleteRelation($id: String!) { issueRelationDelete(id: $id) { success } }`,
          { id: relationId },
          apiKey,
        )) as { issueRelationDelete: { success: boolean } };
        return jsonResult(data.issueRelationDelete);
      }

      throw new Error(`Unknown action: ${action}`);
    },
  };
}
