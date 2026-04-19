"use client";

import { Avatar, type AvatarProps } from "./Avatar";

// Host corner. Keeps the original "P1" orange so the look matches what the
// game store ships with — only the assignment rule (host vs joiner) changes.
const HOST_TINT = "#f97316";

export function RedBoxer(props: AvatarProps) {
  return <Avatar {...props} tintOverride={HOST_TINT} />;
}
