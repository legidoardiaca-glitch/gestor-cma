import crypto from "crypto";

function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("base64url");

  return `${body}.${signature}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  const password = req.body?.password || "";
  const expectedPassword = process.env.BUDGET_PASSWORD;
  const sessionSecret = process.env.BUDGET_SESSION_SECRET;

  if (!expectedPassword || !sessionSecret) {
    return res.status(500).json({
      ok: false,
      error: "Budget environment variables missing",
    });
  }

  if (password !== expectedPassword) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  const expiresAt = Date.now() + 30 * 60 * 1000;

  const token = signSession(
    {
      scope: "budget",
      exp: expiresAt,
    },
    sessionSecret
  );

  res.setHeader(
    "Set-Cookie",
    `budget_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=1800`
  );

  return res.status(200).json({
    ok: true,
    expiresAt,
  });
}
