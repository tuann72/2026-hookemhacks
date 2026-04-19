"use client";

import { Avatar, type AvatarProps } from "./Avatar";

// Joiner corner. Keeps the original "P2" cyan so the look matches what the
// game store ships with — only the assignment rule (host vs joiner) changes.
const JOINER_TINT = "#22d3ee";

export function BlueBoxer(props: AvatarProps) {
  return <Avatar {...props} tintOverride={JOINER_TINT} />;
}
