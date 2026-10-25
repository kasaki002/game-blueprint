import { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  return proxyBackend(request, `/auth/${action}`, { method: "GET" });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  const body = request.headers.get("content-length") === "0" ? undefined : await request.text();
  return proxyBackend(request, `/auth/${action}`, { method: "POST", body });
}
