/**
 * Minimal stateless MCP client over streamable HTTP JSON — multi-server.
 *
 * Local dev:   SWIGGY_MCP_BASE=http://localhost:7301  (default)
 * Production:  SWIGGY_MCP_BASE=https://mcp.swiggy.com + SWIGGY_OAUTH_TOKEN
 *
 * Paths mirror Swiggy's real MCP servers: /food, /im, /dineout.
 */
const BASE = process.env.SWIGGY_MCP_BASE ?? "http://localhost:7301";
const BEARER = process.env.SWIGGY_OAUTH_TOKEN; // production only

export type McpServer = "food" | "im" | "dineout";

let rpcId = 0;

async function rpc(serverPath: McpServer, method: string, params?: unknown): Promise<any> {
  const res = await fetch(`${BASE}/${serverPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(BEARER ? { Authorization: `Bearer ${BEARER}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`MCP ${serverPath} error (${method}): ${body.error.message}`);
  return body.result;
}

export async function listTools(serverPath: McpServer) {
  return (await rpc(serverPath, "tools/list")).tools;
}

export async function callTool<T = any>(serverPath: McpServer, name: string, args: Record<string, unknown>): Promise<T> {
  const result = await rpc(serverPath, "tools/call", { name, arguments: args });
  if (result.isError) throw new Error(result.content?.[0]?.text ?? `Tool ${name} failed`);
  if (result.structuredContent) return result.structuredContent as T;
  return JSON.parse(result.content[0].text) as T;
}
