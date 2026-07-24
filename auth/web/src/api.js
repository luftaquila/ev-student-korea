import { createApiClient } from "@shared/api-base.js";

const { request, json } = createApiClient("/auth");

const body = (data) => ({ body: JSON.stringify(data) });

/* 계정 */
export const fetchUsers = () => json("/api/users");
export const createUser = (data) => json("/api/users", { method: "POST", ...body(data) });
export const createUsersBulk = (users) => json("/api/users/bulk", { method: "POST", ...body({ users }) });
export const updateUser = (id, data) => request(`/api/users/${id}`, { method: "PATCH", ...body(data) });
export const deleteUser = (id) => request(`/api/users/${id}`, { method: "DELETE" });
export const toggleUsers = (ids, active) => json("/api/users/bulk", { method: "PATCH", ...body({ ids, active }) });
export const deleteUsers = (ids) => json("/api/users/bulk", { method: "DELETE", ...body({ ids }) });

/* 로그 */
export const fetchLogs = (params) => json(`/api/admin/logs?${new URLSearchParams(params)}`);
export const fetchLogServices = () => json("/api/admin/services");
