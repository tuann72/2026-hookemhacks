import { NextResponse } from "next/server";

export async function POST() {
  // TODO: Calculate score
  return NextResponse.json({ score: 0, caloriesBurned: 0 });
}
