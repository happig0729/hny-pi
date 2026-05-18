import type { ApiClient } from "./archive-api.js";
import type { AuthContext, SystemRole, UserProfile } from "./auth-types.js";

interface JwtPayload {
	userId: number;
	tenantId: number;
	role: string;
	iat: number;
	exp: number;
}

const VALID_SYSTEM_ROLES = ["super_admin", "tenant_admin", "system_admin", "tenant_user"];

export function parseJwt(token: string): JwtPayload | null {
	try {
		const payload = JSON.parse(atob(token.split(".")[1]));
		if (typeof payload.tenantId !== "number" || typeof payload.userId !== "number") {
			return null;
		}
		if (payload.exp && Date.now() >= payload.exp * 1000) {
			return null;
		}
		return payload as JwtPayload;
	} catch {
		return null;
	}
}

export async function loadAuthContext(client: ApiClient): Promise<AuthContext | null> {
	const token = client.getToken();
	if (!token) {
		return {
			user: { id: 0, name: "开发模式", username: "dev", role: "super_admin", status: "active", createdAt: "" },
			tenantId: 0,
			systemRole: "super_admin",
			isSuperAdmin: true,
			isTenantAdmin: true,
		};
	}

	const jwt = parseJwt(token);
	if (!jwt) return null;

	try {
		const user = await client.call("getMe") as UserProfile;
		const systemRole = VALID_SYSTEM_ROLES.includes(jwt.role as SystemRole)
			? (jwt.role as SystemRole)
			: "tenant_user";
		return {
			user,
			tenantId: jwt.tenantId,
			systemRole,
			isSuperAdmin: systemRole === "super_admin",
			isTenantAdmin: systemRole === "tenant_admin" || systemRole === "super_admin",
		};
	} catch {
		return null;
	}
}

