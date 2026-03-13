import { getNetworkInfo } from "@/lib/network";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = getNetworkInfo(parseInt(process.env.PORT || "3100", 10));
  const token = process.env.AUTH_TOKEN;
  const authUrl = token ? `${info.url}?token=${token}` : info.url;
  return Response.json({ ...info, authUrl, workspace: getWorkspace() });
}
