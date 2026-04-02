import { Type } from "@sinclair/typebox";
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

const LinearSchema = Type.Object(
  {
    query: Type.String({
      description:
        "GraphQL query or mutation string. Use named operations (e.g. query MyOp { ... } or mutation CreateIssue($input: IssueCreateInput!) { ... })",
    }),
    variables: Type.Optional(
      Type.Object({}, { additionalProperties: true, description: "GraphQL variables object" }),
    ),
  },
  { additionalProperties: false },
);

/**
 * Single pass-through tool for the entire Linear GraphQL API.
 * Accepts any query or mutation and returns the raw `data` payload.
 * Errors from the API are surfaced as tool errors.
 */
export function createLinearTool(): AnyAgentTool {
  return {
    name: "linear",
    label: "linear",
    description: `Execute any Linear GraphQL query or mutation via the Linear API.

Provide a valid GraphQL operation string and optional variables object.
Returns the raw \`data\` payload from the Linear API.

Common operations:
- List teams: query { teams { nodes { id name key } } }
- List issues: query Issues($filter: IssueFilter) { issues(filter: $filter) { nodes { id identifier title state { name } assignee { name } priority } } }
- Search issues: query { issueSearch(query: "...") { nodes { id identifier title } } }
- Get issue: query Issue($id: String!) { issue(id: $id) { id identifier title description state { name } assignee { name } labels { nodes { name } } comments { nodes { body user { name } } } } }
- Create issue: mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url } } }
- Update issue: mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier } } }
- List projects: query { projects { nodes { id name state url } } }
- Active cycle: query ActiveCycle($teamId: String!) { team(id: $teamId) { activeCycle { id name number issues { nodes { id identifier title state { name } } } } } }
- Viewer info: query { viewer { id name email } }

Full schema: https://studio.apollographql.com/public/Linear-API/variant/current/explorer`,
    parameters: LinearSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const variables =
        params["variables"] && typeof params["variables"] === "object"
          ? (params["variables"] as Record<string, unknown>)
          : {};
      const apiKey = resolveApiKey();

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

      return jsonResult(json.data);
    },
  };
}

// Legacy named exports kept so existing callers compile without changes.
// They all delegate to createLinearTool().
export const createLinearIssueTool = createLinearTool;
export const createLinearProjectTool = createLinearTool;
export const createLinearQueueTool = createLinearTool;
export const createLinearCommentTool = createLinearTool;
export const createLinearTeamTool = createLinearTool;
export const createLinearRelationTool = createLinearTool;
