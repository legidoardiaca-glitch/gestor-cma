import crypto from "crypto";

function verifySession(token, secret) {
  if (!token || !token.includes(".")) return false;

  const [body, signature] = token.split(".");

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");

  if (signature !== expectedSignature) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));

    if (payload.scope !== "budget") return false;
    if (!payload.exp || Date.now() > payload.exp) return false;

    return true;
  } catch (error) {
    return false;
  }
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());

  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  if (!match) return "";

  return decodeURIComponent(match.split("=").slice(1).join("="));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  const sessionSecret = process.env.BUDGET_SESSION_SECRET;
  const sourceUrl = process.env.BUDGET_SOURCE_URL;
  const sourceToken = process.env.BUDGET_SOURCE_TOKEN;

  if (!sessionSecret || !sourceUrl || !sourceToken) {
    return res.status(500).json({
      ok: false,
      error: "Budget environment variables missing",
    });
  }

  const sessionToken = getCookie(req, "budget_session");

  if (!verifySession(sessionToken, sessionSecret)) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  const url = `${sourceUrl}?token=${encodeURIComponent(sourceToken)}`;

  const response = await fetch(url);

  if (!response.ok) {
    return res.status(502).json({
      ok: false,
      error: "Budget source error",
    });
  }

  const data = await response.json();

  if (!data.ok) {
    return res.status(502).json({
      ok: false,
      error: data.error || "Budget source returned error",
    });
  }

  return res.status(200).json({
    ok: true,
    count: data.count || 0,
    rows: data.rows || [],
  });
}
