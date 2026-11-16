import { randomBytes } from "node:crypto";

export const newRoomId = () => randomBytes(9).toString("base64url"); // 12 chars
export const newPeerId = () => randomBytes(6).toString("base64url"); // 8 chars
export const newSecret = () => randomBytes(18).toString("base64url"); // 24 chars
