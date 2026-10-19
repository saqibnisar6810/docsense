import "server-only";
import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Blocks webhooks to private networks, so the server can't be used to reach internal systems. */
function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function checkWebhookUrl(raw: string): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "That isn't a valid URL.";
  }
  if (url.protocol !== "https:") return "Use an https:// URL.";
  if (url.username || url.password) return "Remove the username and password from the URL.";
  if (url.port && url.port !== "443") return "Use the standard https port.";
  try {
    const addrs = await lookup(url.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivate(a.address))) return "That address points to a private network.";
  } catch {
    return "That host can't be found.";
  }
  return null;
}

export const sign = (secret: string, timestamp: string, body: string) =>
  createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

/** Sends a signed JSON event. Never throws: returns what happened so it can be logged. */
export async function deliver(url: string, secret: string, event: string, data: unknown) {
  const problem = await checkWebhookUrl(url);
  if (problem) return { ok: false, status: 0, error: problem };
  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), data });
  const ts = Math.floor(Date.now() / 1000).toString();
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
      headers: {
        "content-type": "application/json",
        "user-agent": "DocSense-Webhooks/1.0",
        "x-docsense-event": event,
        "x-docsense-timestamp": ts,
        "x-docsense-signature": `sha256=${sign(secret, ts, body)}`,
      },
      body,
    });
    return { ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - started, error: e instanceof Error && e.name === "TimeoutError" ? "Timed out after 5s" : "Couldn't connect" };
  }
}
