import { NextRequest, NextResponse } from "next/server";

const backend = process.env.BACKEND_API_URL || "http://localhost:8000/api";

export async function proxyBackend(request: NextRequest, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const cookie = request.headers.get("cookie");
  const origin = request.headers.get("origin") || process.env.FRONTEND_ORIGIN || "http://localhost:3000";
  if (cookie) headers.set("cookie", cookie);
  headers.set("origin", origin);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${backend}${path}`, { ...init, headers, cache: "no-store" });
  const responseHeaders = new Headers();
  for (const name of ["content-type", "content-disposition", "set-cookie"]) {
    const value = response.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new NextResponse(response.body, { status: response.status, headers: responseHeaders });
}
