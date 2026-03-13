import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cr_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function unauthorizedHtml(wrongToken = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Cursor Remote</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      color: #e8e8e8;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      max-width: 380px;
      width: 100%;
      text-align: center;
    }
    .lock {
      width: 40px;
      height: 40px;
      margin: 0 auto 20px;
      color: #555;
    }
    h1 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .sub {
      font-size: 13px;
      color: #999;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .steps {
      text-align: left;
      background: #111;
      border: 1px solid #1e1e1e;
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 20px;
    }
    .step {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 8px 0;
    }
    .step + .step {
      border-top: 1px solid #1e1e1e;
    }
    .num {
      font-size: 11px;
      font-weight: 600;
      color: #555;
      background: #1a1a1a;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .step p {
      font-size: 13px;
      color: #999;
      line-height: 1.5;
    }
    code {
      font-family: "SF Mono", "Fira Code", Menlo, Consolas, monospace;
      font-size: 12px;
      background: #1a1a1a;
      color: #e8e8e8;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .hint {
      font-size: 11px;
      color: #555;
      line-height: 1.5;
    }
    .divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 20px 0;
    }
    .divider::before, .divider::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #1e1e1e;
    }
    .divider span {
      font-size: 11px;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .input-group {
      display: flex;
      gap: 8px;
    }
    .input-group input {
      flex: 1;
      background: #111;
      border: 1px solid #1e1e1e;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 13px;
      font-family: "SF Mono", "Fira Code", Menlo, Consolas, monospace;
      color: #e8e8e8;
      outline: none;
      transition: border-color 0.15s;
    }
    .input-group input::placeholder { color: #555; }
    .input-group input:focus { border-color: #555; }
    .input-group button {
      background: #e8e8e8;
      color: #000;
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
      white-space: nowrap;
    }
    .input-group button:hover { opacity: 0.85; }
    .input-group button:disabled { opacity: 0.3; cursor: not-allowed; }
    .error-msg {
      margin-top: 10px;
      font-size: 12px;
      color: #ef4444;
    }
    .input-group input.shake {
      border-color: #ef4444;
      animation: shake 0.3s ease;
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
  </style>
</head>
<body>
  <div class="card">
    <svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
    <h1>Authentication required</h1>
    <p class="sub">Scan the QR code from your terminal, or paste the token below.</p>
    <form id="auth" class="input-group" onsubmit="return handleSubmit(event)">
      <input id="token" type="text" placeholder="Paste token here" autocomplete="off" spellcheck="false" autofocus class="${wrongToken ? "shake" : ""}" />
      <button type="submit">Connect</button>
    </form>
    ${wrongToken ? '<p class="error-msg">Wrong token. Check your terminal for the correct one.</p>' : ""}
    <div class="divider"><span>or</span></div>
    <div class="steps">
      <div class="step">
        <span class="num">1</span>
        <p>Scan the <strong style="color:#e8e8e8">QR code</strong> shown in the terminal where you ran <code>clr</code></p>
      </div>
      <div class="step">
        <span class="num">2</span>
        <p>Find the token in your terminal output after starting cursor-local-remote</p>
      </div>
    </div>
    <p class="hint">The token is printed in the terminal when cursor-local-remote starts.</p>
  </div>
  <script>
    function handleSubmit(e) {
      e.preventDefault();
      var v = document.getElementById("token").value.trim();
      if (!v) return false;
      window.location.href = "?token=" + encodeURIComponent(v);
      return false;
    }
  </script>
</body>
</html>`;
}

export function middleware(req: NextRequest) {
  const token = process.env.AUTH_TOKEN;
  if (!token) {
    console.warn("[clr] AUTH_TOKEN is not set — all requests are unauthenticated");
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  const queryToken = url.searchParams.get("token");

  if (queryToken !== null) {
    if (queryToken === token) {
      url.searchParams.delete("token");
      const res = NextResponse.redirect(url);
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        maxAge: COOKIE_MAX_AGE,
      });
      return res;
    }

    return new NextResponse(unauthorizedHtml(true), {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie === token) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${token}`) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return new NextResponse(unauthorizedHtml(false), {
    status: 401,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
