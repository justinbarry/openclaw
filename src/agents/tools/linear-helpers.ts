import { Type } from "@sinclair/typebox";
import { optionalStringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

const LINEAR_API_URL = "https://api.linear.app/graphql";

function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env["LINEAR_API_KEY"]?.trim();
  if (!key) {
    throw new Error(
      "LINEAR_API_KEY is not configured. Set it via: openclaw config set env.LINEAR_API_KEY <key>",
    );
  }
  return key;
}

async function linearRequest<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const apiKey = resolveApiKey();
  const resp = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) {
    throw new Error(`Linear API HTTP ${resp.status}: ${await resp.text()}`);
  }
  const json = (await resp.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    throw new Error(`Linear API errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

// ---------------------------------------------------------------------------
// linear_get_project
// ---------------------------------------------------------------------------

export function createLinearGetProjectTool(): AnyAgentTool {
  return {
    name: "linear_get_project",
    label: "linear_get_project",
    description:
      "Look up a Linear project by name fragment, URL slug, or UUID. " +
      "Returns id, name, description, content (markdown body), status, lead, members, " +
      "milestones, recent updates, and the project URL. " +
      "Use this before updating a project so you have the correct UUID.",
    parameters: Type.Object(
      {
        query: Type.String({
          description:
            'Project name fragment, URL slug (e.g. "my-project-abc123"), or UUID. ' +
            "Case-insensitive substring match on name when not a UUID/slug.",
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const q = readStringParam(params, "query", { required: true });

      // UUID pattern
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRe.test(q)) {
        const data = await linearRequest<{ project: unknown }>(
          `query GetProject($id: String!) {
             project(id: $id) {
               id name description content slugId url
               status { id name type color }
               lead { id name displayName }
               members { nodes { id name displayName } }
               teams { nodes { id name key } }
               startDate targetDate priority priorityLabel
               projectMilestones { nodes { id name targetDate description } }
               projectUpdates(first: 5) { nodes { id body health createdAt } }
               createdAt updatedAt
             }
           }`,
          { id: q },
        );
        return jsonResult(data);
      }

      // Substring / slug search
      const data = await linearRequest<{ projects: { nodes: unknown[] } }>(
        `query SearchProjects($term: String!) {
           projects(filter: { name: { containsIgnoreCase: $term } }, first: 20) {
             nodes {
               id name description content slugId url
               status { id name type color }
               lead { id name displayName }
               members { nodes { id name displayName } }
               teams { nodes { id name key } }
               startDate targetDate priority priorityLabel
               projectMilestones { nodes { id name targetDate description } }
               projectUpdates(first: 5) { nodes { id body health createdAt } }
               createdAt updatedAt
             }
           }
         }`,
        { term: q },
      );
      const nodes = (data as { projects: { nodes: unknown[] } }).projects.nodes;
      return jsonResult(nodes.length === 1 ? nodes[0] : nodes);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_update_project
// ---------------------------------------------------------------------------

export function createLinearUpdateProjectTool(): AnyAgentTool {
  return {
    name: "linear_update_project",
    label: "linear_update_project",
    description:
      "Update a Linear project's description and/or content (markdown body). " +
      "Use linear_get_project first to get the UUID if you only have a name. " +
      "description = one-liner shown in project lists; " +
      "content = rich markdown body of the project page.",
    parameters: Type.Object(
      {
        id: Type.String({ description: "Project UUID" }),
        description: Type.Optional(
          Type.String({ description: "Short project description (one-liner)" }),
        ),
        content: Type.Optional(
          Type.String({ description: "Full markdown body of the project page" }),
        ),
        name: Type.Optional(Type.String({ description: "Rename the project" })),
        status_id: Type.Optional(
          Type.String({
            description:
              "Workflow status UUID. Get from project.status.id or projectStatuses query.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "id", { required: true });
      const input: Record<string, unknown> = {};
      const description = readStringParam(params, "description");
      const content = readStringParam(params, "content");
      const name = readStringParam(params, "name");
      const statusId = readStringParam(params, "status_id");
      if (description !== undefined) {
        input["description"] = description;
      }
      if (content !== undefined) {
        input["content"] = content;
      }
      if (name !== undefined) {
        input["name"] = name;
      }
      if (statusId !== undefined) {
        input["statusId"] = statusId;
      }
      if (Object.keys(input).length === 0) {
        throw new Error(
          "Provide at least one field to update: description, content, name, or status_id",
        );
      }
      const data = await linearRequest(
        `mutation UpdateProject($id: String!, $input: ProjectUpdateInput!) {
           projectUpdate(id: $id, input: $input) {
             success
             project { id name description content url updatedAt }
           }
         }`,
        { id: projectId, input },
      );
      return jsonResult(data);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_create_project_update
// ---------------------------------------------------------------------------

const PROJECT_HEALTH_VALUES = ["onTrack", "atRisk", "offTrack"] as const;

export function createLinearCreateProjectUpdateTool(): AnyAgentTool {
  return {
    name: "linear_create_project_update",
    label: "linear_create_project_update",
    description:
      "Post a status update (progress update) to a Linear project. " +
      "body = markdown text of the update. " +
      'health = "onTrack" | "atRisk" | "offTrack" (optional, defaults to current).',
    parameters: Type.Object(
      {
        project_id: Type.String({ description: "Project UUID" }),
        body: Type.String({ description: "Markdown body of the status update" }),
        health: optionalStringEnum(PROJECT_HEALTH_VALUES, {
          description: '"onTrack" | "atRisk" | "offTrack"',
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const projectId = readStringParam(params, "project_id", { required: true });
      const body = readStringParam(params, "body", { required: true });
      const health = readStringParam(params, "health");
      const input: Record<string, unknown> = { projectId, body };
      if (health) {
        input["health"] = health;
      }
      const data = await linearRequest(
        `mutation CreateProjectUpdate($input: ProjectUpdateCreateInput!) {
           projectUpdateCreate(input: $input) {
             success
             projectUpdate { id body health createdAt url }
           }
         }`,
        { input },
      );
      return jsonResult(data);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_find_issue
// ---------------------------------------------------------------------------

export function createLinearFindIssueTool(): AnyAgentTool {
  return {
    name: "linear_find_issue",
    label: "linear_find_issue",
    description:
      'Find Linear issues by text search or identifier (e.g. "ENG-42"). ' +
      "Returns up to 25 matches with id, identifier, title, state, assignee, priority, and URL.",
    parameters: Type.Object(
      {
        query: Type.String({
          description: 'Free-text search term or exact identifier like "ENG-42"',
        }),
        team_key: Type.Optional(
          Type.String({ description: 'Narrow to a team by key, e.g. "ENG"' }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const q = readStringParam(params, "query", { required: true });
      const teamKey = readStringParam(params, "team_key");

      // Exact identifier shortcut (e.g. "ENG-42")
      const identRe = /^[A-Z]+-\d+$/;
      if (identRe.test(q.trim().toUpperCase())) {
        const data = await linearRequest(
          `query IssueByIdentifier($id: String!) {
             issue(id: $id) {
               id identifier title description url priority priorityLabel
               state { name type }
               assignee { name displayName }
               labels { nodes { name } }
               project { id name }
               dueDate createdAt updatedAt
             }
           }`,
          { id: q.trim().toUpperCase() },
        );
        return jsonResult(data);
      }

      const filter: Record<string, unknown> = {};
      if (teamKey) {
        filter["team"] = { key: { eq: teamKey } };
      }

      const data = await linearRequest(
        `query SearchIssues($term: String!, $filter: IssueFilter) {
           searchIssues(term: $term, filter: $filter, first: 25) {
             nodes {
               id identifier title url priority priorityLabel
               state { name type }
               assignee { name displayName }
               project { id name }
               dueDate
             }
           }
         }`,
        { term: q, filter: Object.keys(filter).length ? filter : undefined },
      );
      return jsonResult(data);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_update_issue
// ---------------------------------------------------------------------------

export function createLinearUpdateIssueTool(): AnyAgentTool {
  return {
    name: "linear_update_issue",
    label: "linear_update_issue",
    description:
      'Update fields on a Linear issue. Accepts UUID or identifier (e.g. "ENG-42"). ' +
      "Only provide the fields you want to change; omitted fields are unchanged. " +
      'Set assignee_id/project_id/parent_id to null string "null" to clear them.',
    parameters: Type.Object(
      {
        id: Type.String({ description: 'Issue UUID or identifier like "ENG-42"' }),
        title: Type.Optional(Type.String({ description: "New title" })),
        description: Type.Optional(Type.String({ description: "Markdown body" })),
        state_id: Type.Optional(Type.String({ description: "Workflow state UUID" })),
        assignee_id: Type.Optional(
          Type.String({ description: 'User UUID, or "null" to unassign' }),
        ),
        priority: Type.Optional(
          Type.Number({ description: "0=none 1=urgent 2=high 3=medium 4=low" }),
        ),
        project_id: Type.Optional(
          Type.String({ description: 'Project UUID, or "null" to remove from project' }),
        ),
        due_date: Type.Optional(Type.String({ description: 'ISO date "YYYY-MM-DD"' })),
        label_ids: Type.Optional(
          Type.Array(Type.String(), { description: "Replace all labels (array of UUIDs)" }),
        ),
      },
      { additionalProperties: false },
    ),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const issueId = readStringParam(params, "id", { required: true });
      const input: Record<string, unknown> = {};
      const title = readStringParam(params, "title");
      const description = readStringParam(params, "description");
      const stateId = readStringParam(params, "state_id");
      const assigneeId = readStringParam(params, "assignee_id");
      const projectId = readStringParam(params, "project_id");
      const dueDate = readStringParam(params, "due_date");
      if (title !== undefined) {
        input["title"] = title;
      }
      if (description !== undefined) {
        input["description"] = description;
      }
      if (stateId !== undefined) {
        input["stateId"] = stateId;
      }
      if (assigneeId !== undefined) {
        input["assigneeId"] = assigneeId === "null" ? null : assigneeId;
      }
      if (projectId !== undefined) {
        input["projectId"] = projectId === "null" ? null : projectId;
      }
      if (dueDate !== undefined) {
        input["dueDate"] = dueDate;
      }
      if (params["priority"] !== undefined) {
        input["priority"] = params["priority"];
      }
      if (Array.isArray(params["label_ids"])) {
        input["labelIds"] = params["label_ids"];
      }
      if (Object.keys(input).length === 0) {
        throw new Error("Provide at least one field to update");
      }
      const data = await linearRequest(
        `mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
           issueUpdate(id: $id, input: $input) {
             success
             issue { id identifier title url state { name } assignee { name } updatedAt }
           }
         }`,
        { id: issueId, input },
      );
      return jsonResult(data);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_get_team
// ---------------------------------------------------------------------------

export function createLinearGetTeamTool(): AnyAgentTool {
  return {
    name: "linear_get_team",
    label: "linear_get_team",
    description:
      'Get a Linear team by key (e.g. "ENG") or name fragment. ' +
      "Returns team id, states (workflow states with UUIDs), labels, members, and active cycle.",
    parameters: Type.Object(
      {
        query: Type.String({
          description: 'Team key like "ENG" or a name fragment',
        }),
      },
      { additionalProperties: false },
    ),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const q = readStringParam(params, "query", { required: true });

      // Try exact key first
      const data = await linearRequest<{ teams: { nodes: unknown[] } }>(
        `query GetTeams {
           teams {
             nodes {
               id name key description color
               states { nodes { id name type color position } }
               labels { nodes { id name color } }
               members { nodes { id name displayName email } }
               activeCycle { id number startsAt endsAt }
             }
           }
         }`,
      );
      const teams = data.teams.nodes as Array<{ key: string; name: string }>;
      const upper = q.toUpperCase();
      const exact = teams.find((t) => t.key.toUpperCase() === upper);
      if (exact) {
        return jsonResult(exact);
      }
      const partial = teams.filter(
        (t) =>
          t.name.toLowerCase().includes(q.toLowerCase()) ||
          t.key.toLowerCase().includes(q.toLowerCase()),
      );
      return jsonResult(partial.length === 1 ? partial[0] : partial);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_search_docs
// ---------------------------------------------------------------------------

export function createLinearSearchDocsTool(): AnyAgentTool {
  return {
    name: "linear_search_docs",
    label: "linear_search_docs",
    description:
      "Search Linear documents by keyword. Returns id, title, URL, project link, and snippet.",
    parameters: Type.Object(
      {
        term: Type.String({ description: "Search term" }),
        project_id: Type.Optional(Type.String({ description: "Limit to a specific project UUID" })),
      },
      { additionalProperties: false },
    ),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const term = readStringParam(params, "term", { required: true });
      const projectId = readStringParam(params, "project_id");

      if (projectId) {
        // Filtered doc list when we know the project
        const data = await linearRequest(
          `query ProjectDocs($filter: DocumentFilter) {
             documents(filter: $filter, first: 25) {
               nodes { id title url updatedAt project { id name } creator { name } }
             }
           }`,
          { filter: { project: { id: { eq: projectId } }, title: { containsIgnoreCase: term } } },
        );
        return jsonResult(data);
      }

      const data = await linearRequest(
        `query SearchDocs($term: String!) {
           searchDocuments(term: $term, first: 25) {
             nodes {
               document { id title url updatedAt project { id name } creator { name } }
               metadata
             }
           }
         }`,
        { term },
      );
      return jsonResult(data);
    },
  };
}

// ---------------------------------------------------------------------------
// linear_manage_doc
// ---------------------------------------------------------------------------

export function createLinearManageDocTool(): AnyAgentTool {
  return {
    name: "linear_manage_doc",
    label: "linear_manage_doc",
    description:
      "Create or update a Linear document attached to a project, issue, or initiative. " +
      "To create: provide project_id (or issue_id) + title + content. " +
      "To update: provide doc_id + fields to change. " +
      "content is markdown. Returns the document id, title, and URL.",
    parameters: Type.Object(
      {
        doc_id: Type.Optional(
          Type.String({
            description: "Existing document UUID — provide to UPDATE an existing doc",
          }),
        ),
        project_id: Type.Optional(
          Type.String({ description: "Project UUID to attach the doc to (create or move)" }),
        ),
        issue_id: Type.Optional(
          Type.String({ description: "Issue UUID or identifier to attach the doc to" }),
        ),
        title: Type.Optional(Type.String({ description: "Document title" })),
        content: Type.Optional(Type.String({ description: "Document body (markdown)" })),
        icon: Type.Optional(Type.String({ description: "Emoji icon" })),
      },
      { additionalProperties: false },
    ),
    execute: async (_id, args) => {
      const params = args as Record<string, unknown>;
      const docId = readStringParam(params, "doc_id");
      const projectId = readStringParam(params, "project_id");
      const issueId = readStringParam(params, "issue_id");
      const title = readStringParam(params, "title");
      const content = readStringParam(params, "content");
      const icon = readStringParam(params, "icon");

      if (docId) {
        // Update
        const input: Record<string, unknown> = {};
        if (title !== undefined) {
          input["title"] = title;
        }
        if (content !== undefined) {
          input["content"] = content;
        }
        if (projectId !== undefined) {
          input["projectId"] = projectId;
        }
        if (issueId !== undefined) {
          input["issueId"] = issueId;
        }
        if (icon !== undefined) {
          input["icon"] = icon;
        }
        if (Object.keys(input).length === 0) {
          throw new Error("Provide at least one field to update");
        }
        const data = await linearRequest(
          `mutation UpdateDoc($id: String!, $input: DocumentUpdateInput!) {
             documentUpdate(id: $id, input: $input) {
               success
               document { id title url updatedAt project { id name } }
             }
           }`,
          { id: docId, input },
        );
        return jsonResult(data);
      }

      // Create
      if (!title) {
        throw new Error('"title" is required when creating a document');
      }
      if (!projectId && !issueId) {
        throw new Error('Provide "project_id" or "issue_id" when creating a document');
      }
      const input: Record<string, unknown> = { title };
      if (content !== undefined) {
        input["content"] = content;
      }
      if (projectId !== undefined) {
        input["projectId"] = projectId;
      }
      if (issueId !== undefined) {
        input["issueId"] = issueId;
      }
      if (icon !== undefined) {
        input["icon"] = icon;
      }
      const data = await linearRequest(
        `mutation CreateDoc($input: DocumentCreateInput!) {
           documentCreate(input: $input) {
             success
             document { id title url createdAt project { id name } }
           }
         }`,
        { input },
      );
      return jsonResult(data);
    },
  };
}

// Convenience barrel
export function createLinearHelperTools(): AnyAgentTool[] {
  return [
    createLinearGetProjectTool(),
    createLinearUpdateProjectTool(),
    createLinearCreateProjectUpdateTool(),
    createLinearFindIssueTool(),
    createLinearUpdateIssueTool(),
    createLinearGetTeamTool(),
    createLinearSearchDocsTool(),
    createLinearManageDocTool(),
  ];
}
