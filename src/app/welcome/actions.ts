"use server";

import { redirect } from "next/navigation";
import { markEntryChoiceMade } from "@/app/actions";

/** Marks the choice resolved either way — this screen never shows again
 *  regardless of which option was picked. */
export async function chooseAddJobNow(): Promise<void> {
  await markEntryChoiceMade();
  redirect("/add");
}

export async function chooseShowMeAround(): Promise<void> {
  await markEntryChoiceMade();
  redirect("/");
}
