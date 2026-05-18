export type SystemRole = "super_admin" | "tenant_admin" | "system_admin" | "tenant_user";

export type ProjectRole = "project_admin" | "data_admin" | "data_clerk";

export interface UserProfile {
	id: number;
	name: string;
	username: string;
	role: SystemRole;
	email?: string;
	phone?: string;
	department?: string;
	departmentId?: number | null;
	status: "active" | "disabled";
	createdAt: string;
}

export interface ProjectMemberInfo {
	userId: number;
	projectId: number;
	role: ProjectRole;
}

export interface AuthContext {
	user: UserProfile;
	tenantId: number;
	systemRole: SystemRole;
	currentProjectMember?: ProjectMemberInfo;
	isSuperAdmin: boolean;
	isTenantAdmin: boolean;
}
