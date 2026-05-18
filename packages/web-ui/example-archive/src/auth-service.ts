import type { ApiClient } from "./archive-api.js";
import type { AuthContext, SystemRole, ProjectRole, ProjectMemberInfo, UserProfile } from "./auth-types.js";

interface JwtPayload {
	userId: number;
	tenantId: number;
	role: string;
	iat: number;
	exp: number;
}

export function parseJwt(token: string): JwtPayload | null {
	try {
		const payload = JSON.parse(atob(token.split(".")[1]));
		if (typeof payload.tenantId !== "number" || typeof payload.userId !== "number") {
			return null;
		}
		return payload as JwtPayload;
	} catch {
		return null;
	}
}

export async function loadAuthContext(client: ApiClient): Promise<AuthContext | null> {
	const token = client.getToken();
	if (!token) return null;

	const jwt = parseJwt(token);
	if (!jwt) return null;

	try {
		const user = await client.call("getMe") as UserProfile;
		const systemRole = jwt.role;
		return {
			user,
			tenantId: jwt.tenantId,
			systemRole: systemRole as SystemRole,
			isSuperAdmin: systemRole === "super_admin",
			isTenantAdmin: systemRole === "tenant_admin" || systemRole === "super_admin",
		};
	} catch {
		return null;
	}
}

export async function loadProjectMembership(
	client: ApiClient,
	projectId: number | undefined,
	userId: number,
): Promise<ProjectMemberInfo | undefined> {
	if (!projectId) return undefined;
	try {
		const members = await client.call("listProjectMembers", { pathParams: { projectId } }) as { userId: number; role: string }[];
		const entry = members.find((m) => m.userId === userId);
		if (!entry) return undefined;
		return { userId: entry.userId, projectId, role: entry.role as ProjectRole };
	} catch {
		return undefined;
	}
}
