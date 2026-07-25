import { createApiClient } from "@shared/api-base.js";

const { request, json } = createApiClient("/queue");

const body = (data) => ({ body: JSON.stringify(data) });

/* 공개 */
export const fetchStatus = () => json("/api/status");
export const lookup = (data) => json("/api/lookup", { method: "POST", ...body(data) });

/* 대기열 운영 (official) */
export const fetchQueue = () => json("/api/queue");
export const registerQueue = (data) => json("/api/queue", { method: "POST", ...body(data) });
export const callRegistration = (id) => request(`/api/queue/${id}/call`, { method: "POST" });
export const doneRegistration = (id) => request(`/api/queue/${id}/done`, { method: "POST" });
export const cancelRegistration = (id) => request(`/api/queue/${id}/cancel`, { method: "POST" });

/* 설정 (official) */
export const fetchSettings = () => json("/api/settings");
export const updateSettings = (data) => json("/api/settings", { method: "PATCH", ...body(data) });

/* 엔트리 (단건 조회는 official, 나머지 admin) */
export const fetchEntries = () => json("/api/entries");
export const fetchEntry = (num) => json(`/api/entries/${num}`);
export const createEntry = (data) => json("/api/entries", { method: "POST", ...body(data) });
export const createEntriesBulk = (entries) => json("/api/entries/bulk", { method: "POST", ...body({ entries }) });
export const updateEntry = (num, data) => request(`/api/entries/${num}`, { method: "PATCH", ...body(data) });
export const deleteEntry = (num) => request(`/api/entries/${num}`, { method: "DELETE" });
export const deleteEntriesBulk = (nums) => json("/api/entries/bulk", { method: "DELETE", ...body({ nums }) });
