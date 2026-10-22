"use client";

import { useEffect } from "react";
import { forgetDeletedAccount } from "@/lib/browser-data";

export function ForgetBrowserData() {
  useEffect(forgetDeletedAccount, []);
  return null;
}
