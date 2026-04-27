import fs from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildSlackMcpServerConfig, loadSlackMcpCredentials } from "./mcp-slack-auth.js";

vi.mock("../config/paths.js", () => ({
  resolveOAuthDir: () => "/tmp/test-openclaw-credentials",
}));

describe("mcp-slack-auth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadSlackMcpCredentials", () => {
    it("returns null when credentials file does not exist", () => {
      vi.spyOn(fs, "readFileSync").mockImplementation(() => {
        throw new Error("ENOENT");
      });
      expect(loadSlackMcpCredentials()).toBeNull();
    });

    it("returns null when file has no accessToken", () => {
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({}));
      expect(loadSlackMcpCredentials()).toBeNull();
    });

    it("returns credentials when file is valid", () => {
      const creds = {
        accessToken: "xoxe-123",
        refreshToken: "xoxr-456",
        teamName: "TestTeam",
      };
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(creds));
      const result = loadSlackMcpCredentials();
      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe("xoxe-123");
      expect(result!.teamName).toBe("TestTeam");
    });
  });

  describe("buildSlackMcpServerConfig", () => {
    it("builds streamable-http config with Bearer token", () => {
      const config = buildSlackMcpServerConfig({ accessToken: "xoxe-test" });
      expect(config).toEqual({
        url: "https://mcp.slack.com/mcp",
        transport: "streamable-http",
        headers: {
          Authorization: "Bearer xoxe-test",
        },
      });
    });
  });
});
