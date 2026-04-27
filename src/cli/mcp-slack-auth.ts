import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";
import { resolveOAuthDir } from "../config/paths.js";

const SLACK_MCP_SERVER_URL = "https://mcp.slack.com/mcp";
const SLACK_AUTHORIZATION_ENDPOINT = "https://slack.com/oauth/v2_user/authorize";
const SLACK_TOKEN_ENDPOINT = "https://slack.com/api/oauth.v2.user.access";
const SLACK_MCP_SCOPES = [
  "search:read.public",
  "search:read.private",
  "search:read.mpim",
  "search:read.im",
  "search:read.files",
  "search:read.users",
  "chat:write",
  "channels:history",
  "groups:history",
  "mpim:history",
  "im:history",
  "canvases:read",
  "canvases:write",
  "users:read",
  "users:read.email",
];
const REDIRECT_PORT = 8765;
const REDIRECT_PATH = "/oauth/callback";
const CREDENTIALS_FILENAME = "slack-mcp.json";

type SlackMcpCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  teamId?: string;
  teamName?: string;
  userId?: string;
  appId?: string;
};

function resolveSlackMcpCredentialsPath(): string {
  return path.join(resolveOAuthDir(), CREDENTIALS_FILENAME);
}

export function loadSlackMcpCredentials(): SlackMcpCredentials | null {
  const credPath = resolveSlackMcpCredentialsPath();
  try {
    const raw = fs.readFileSync(credPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.accessToken === "string") {
      return parsed as SlackMcpCredentials;
    }
  } catch {
    // File doesn't exist or is malformed
  }
  return null;
}

function saveSlackMcpCredentials(credentials: SlackMcpCredentials): void {
  const credDir = resolveOAuthDir();
  fs.mkdirSync(credDir, { recursive: true });
  const credPath = resolveSlackMcpCredentialsPath();
  fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const command = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";
  return new Promise((resolve, reject) => {
    execFile(command, [url], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<SlackMcpCredentials> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code_verifier: params.codeVerifier,
  });

  const response = await fetch(SLACK_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: HTTP ${response.status}`);
  }

  const result = (await response.json()) as {
    ok: boolean;
    error?: string;
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    team?: { id: string; name: string };
    authed_user?: { id: string };
    app_id?: string;
  };

  if (!result.ok) {
    throw new Error(`Slack token exchange failed: ${result.error ?? "unknown error"}`);
  }

  const credentials: SlackMcpCredentials = {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    scope: result.scope,
    teamId: result.team?.id,
    teamName: result.team?.name,
    userId: result.authed_user?.id,
    appId: result.app_id,
  };

  if (result.expires_in && result.expires_in > 0) {
    credentials.expiresAt = new Date(Date.now() + result.expires_in * 1000).toISOString();
  }

  return credentials;
}

export type SlackMcpAuthResult = {
  success: true;
  credentials: SlackMcpCredentials;
  teamName?: string;
};

export async function runSlackMcpAuth(params: {
  clientId: string;
  clientSecret: string;
  port?: number;
  scopes?: string[];
  log: (...args: unknown[]) => void;
  noOpen?: boolean;
}): Promise<SlackMcpAuthResult> {
  const port = params.port ?? REDIRECT_PORT;
  const scopes = params.scopes ?? SLACK_MCP_SCOPES;
  const redirectUri = `http://localhost:${port}${REDIRECT_PATH}`;
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();

  const authUrl = new URL(SLACK_AUTHORIZATION_ENDPOINT);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", params.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes.join(","));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return new Promise<SlackMcpAuthResult>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) {
        return;
      }

      const reqUrl = new URL(req.url, `http://localhost:${port}`);

      if (reqUrl.pathname !== REDIRECT_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = reqUrl.searchParams.get("code");
      const receivedState = reqUrl.searchParams.get("state");
      const error = reqUrl.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<h1>Authorization denied</h1><p>Slack returned: ${error}</p><p>You can close this tab.</p>`,
        );
        server.close();
        reject(new Error(`Slack OAuth denied: ${error}`));
        return;
      }

      if (!code || receivedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Invalid callback</h1><p>Missing or mismatched state/code.</p>");
        server.close();
        reject(new Error("Invalid OAuth callback: missing code or state mismatch"));
        return;
      }

      params.log("Exchanging authorization code for token...");

      exchangeCodeForToken({
        clientId: params.clientId,
        clientSecret: params.clientSecret,
        code,
        redirectUri,
        codeVerifier,
      })
        .then((credentials) => {
          saveSlackMcpCredentials(credentials);

          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(
            `<h1>Authorization successful!</h1>` +
              `<p>Connected to Slack${credentials.teamName ? ` team: ${credentials.teamName}` : ""}.</p>` +
              `<p>You can close this tab and return to the terminal.</p>`,
          );

          server.close();
          resolve({
            success: true,
            credentials,
            teamName: credentials.teamName,
          });
        })
        .catch((err) => {
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end(`<h1>Token exchange failed</h1><p>${String(err)}</p>`);
          server.close();
          reject(err);
        });
    });

    server.listen(port, () => {
      params.log(`Listening for OAuth callback on http://localhost:${port}${REDIRECT_PATH}`);
      params.log(`Opening Slack authorization in your browser...`);

      if (!params.noOpen) {
        openBrowser(authUrl.toString()).catch(() => {
          params.log(`Could not open browser. Open this URL manually:\n${authUrl.toString()}`);
        });
      } else {
        params.log(`Open this URL in your browser:\n\n${authUrl.toString()}\n`);
      }
    });

    server.on("error", (err) => {
      reject(new Error(`Failed to start OAuth callback server: ${String(err)}`));
    });
  });
}

/**
 * Build the MCP server config for Slack MCP, using stored credentials.
 */
export function buildSlackMcpServerConfig(
  credentials: SlackMcpCredentials,
): Record<string, unknown> {
  return {
    url: SLACK_MCP_SERVER_URL,
    transport: "streamable-http",
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
    },
  };
}
