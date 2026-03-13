import { getNetworkInfo } from "@/lib/network";
import { getWorkspace, setWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = getNetworkInfo(parseInt(process.env.PORT || "3000", 10));
  return Response.json({ ...info, workspace: getWorkspace() });
}

export async function POST(req: Request) {
  const body = await req.json();
  if (body.workspace && typeof body.workspace === "string") {
    setWorkspace(body.workspace);
    return Response.json({ workspace: getWorkspace() });
  }
  return Response.json({ error: "workspace is required" }, { status: 400 });
}
