import { Command } from "commander";
import { parseConfigValue } from "../auto-reply/reply/config-value.js";
import {
  listConfiguredMcpServers,
  setConfiguredMcpServer,
  unsetConfiguredMcpServer,
} from "../config/mcp-config.js";
import { serveOpenClawChannelMcp } from "../mcp/channel-server.js";
import { defaultRuntime } from "../runtime.js";
import {
  normalizeLowercaseStringOrEmpty,
  normalizeStringifiedOptionalString,
} from "../shared/string-coerce.js";
import { resolveGatewayAuthOptions } from "./gateway-secret-options.js";
import {
  runSlackMcpAuth,
  loadSlackMcpCredentials,
  buildSlackMcpServerConfig,
} from "./mcp-slack-auth.js";

function fail(message: string): never {
  defaultRuntime.error(message);
  defaultRuntime.exit(1);
  throw new Error(message);
}

function printJson(value: unknown): void {
  defaultRuntime.writeJson(value);
}

export function registerMcpCli(program: Command) {
  const mcp = program.command("mcp").description("Manage OpenClaw MCP config and channel bridge");

  mcp
    .command("serve")
    .description("Expose OpenClaw channels over MCP stdio")
    .option("--url <url>", "Gateway WebSocket URL (defaults to gateway.remote.url when configured)")
    .option("--token <token>", "Gateway token (if required)")
    .option("--token-file <path>", "Read gateway token from file")
    .option("--password <password>", "Gateway password (if required)")
    .option("--password-file <path>", "Read gateway password from file")
    .option(
      "--claude-channel-mode <mode>",
      "Claude channel notification mode: auto, on, or off",
      "auto",
    )
    .option("-v, --verbose", "Verbose logging to stderr", false)
    .action(async (opts) => {
      try {
        const { gatewayToken, gatewayPassword } = resolveGatewayAuthOptions(opts);
        const claudeChannelMode = normalizeLowercaseStringOrEmpty(
          normalizeStringifiedOptionalString(opts.claudeChannelMode) ?? "auto",
        );
        if (
          claudeChannelMode !== "auto" &&
          claudeChannelMode !== "on" &&
          claudeChannelMode !== "off"
        ) {
          throw new Error("Invalid --claude-channel-mode value. Use auto, on, or off.");
        }
        await serveOpenClawChannelMcp({
          gatewayUrl: opts.url as string | undefined,
          gatewayToken,
          gatewayPassword,
          claudeChannelMode,
          verbose: Boolean(opts.verbose),
        });
      } catch (err) {
        defaultRuntime.error(String(err));
        defaultRuntime.exit(1);
      }
    });

  mcp
    .command("list")
    .description("List configured MCP servers")
    .option("--json", "Print JSON")
    .action(async (opts: { json?: boolean }) => {
      const loaded = await listConfiguredMcpServers();
      if (!loaded.ok) {
        fail(loaded.error);
      }
      if (opts.json) {
        printJson(loaded.mcpServers);
        return;
      }
      const names = Object.keys(loaded.mcpServers).toSorted();
      if (names.length === 0) {
        defaultRuntime.log(`No MCP servers configured in ${loaded.path}.`);
        return;
      }
      defaultRuntime.log(`MCP servers (${loaded.path}):`);
      for (const name of names) {
        defaultRuntime.log(`- ${name}`);
      }
    });

  mcp
    .command("show")
    .description("Show one configured MCP server or the full MCP config")
    .argument("[name]", "MCP server name")
    .option("--json", "Print JSON")
    .action(async (name: string | undefined, opts: { json?: boolean }) => {
      const loaded = await listConfiguredMcpServers();
      if (!loaded.ok) {
        fail(loaded.error);
      }
      const value = name ? loaded.mcpServers[name] : loaded.mcpServers;
      if (name && !value) {
        fail(`No MCP server named "${name}" in ${loaded.path}.`);
      }
      if (opts.json) {
        printJson(value ?? {});
        return;
      }
      if (name) {
        defaultRuntime.log(`MCP server "${name}" (${loaded.path}):`);
      } else {
        defaultRuntime.log(`MCP servers (${loaded.path}):`);
      }
      printJson(value ?? {});
    });

  mcp
    .command("set")
    .description("Set one configured MCP server from a JSON object")
    .argument("<name>", "MCP server name")
    .argument("<value>", 'JSON object, for example {"command":"uvx","args":["context7-mcp"]}')
    .action(async (name: string, rawValue: string) => {
      const parsed = parseConfigValue(rawValue);
      if (parsed.error) {
        fail(parsed.error);
      }
      const result = await setConfiguredMcpServer({ name, server: parsed.value });
      if (!result.ok) {
        fail(result.error);
      }
      defaultRuntime.log(`Saved MCP server "${name}" to ${result.path}.`);
    });

  mcp
    .command("unset")
    .description("Remove one configured MCP server")
    .argument("<name>", "MCP server name")
    .action(async (name: string) => {
      const result = await unsetConfiguredMcpServer({ name });
      if (!result.ok) {
        fail(result.error);
      }
      if (!result.removed) {
        fail(`No MCP server named "${name}" in ${result.path}.`);
      }
      defaultRuntime.log(`Removed MCP server "${name}" from ${result.path}.`);
    });

  // --- Slack MCP auth ---
  const auth = mcp.command("auth").description("Authenticate MCP server integrations");

  auth
    .command("slack")
    .description("Authorize OpenClaw to use the Slack MCP Server (https://mcp.slack.com/mcp)")
    .requiredOption("--client-id <id>", "Slack app client ID")
    .requiredOption("--client-secret <secret>", "Slack app client secret")
    .option(
      "--port <port>",
      "Local port for OAuth redirect callback",
      (v) => Number.parseInt(v, 10),
      8765,
    )
    .option("--no-open", "Print the authorization URL instead of opening a browser")
    .option("--register-only", "Register stored credentials without re-authenticating")
    .action(
      async (opts: {
        clientId: string;
        clientSecret: string;
        port: number;
        open: boolean;
        registerOnly?: boolean;
      }) => {
        try {
          let credentials = loadSlackMcpCredentials();

          if (opts.registerOnly) {
            if (!credentials) {
              fail("No stored Slack MCP credentials found. Run without --register-only first.");
            }
          } else {
            defaultRuntime.log("Starting Slack MCP OAuth flow...");
            const result = await runSlackMcpAuth({
              clientId: opts.clientId,
              clientSecret: opts.clientSecret,
              port: opts.port,
              noOpen: !opts.open,
              log: defaultRuntime.log,
            });
            credentials = result.credentials;
            defaultRuntime.log(
              `Slack MCP authorized${result.teamName ? ` for team: ${result.teamName}` : ""}.`,
            );
          }

          // Register the MCP server in OpenClaw config
          const serverConfig = buildSlackMcpServerConfig(credentials);
          const setResult = await setConfiguredMcpServer({
            name: "slack",
            server: serverConfig,
          });
          if (!setResult.ok) {
            fail(setResult.error);
          }

          defaultRuntime.log(`Registered Slack MCP server as "slack" in ${setResult.path}.`);
          defaultRuntime.log(
            "Slack MCP tools (search, send, read channels/threads, canvases) are now available to agents.",
          );
        } catch (err) {
          defaultRuntime.error(String(err));
          defaultRuntime.exit(1);
        }
      },
    );
}
