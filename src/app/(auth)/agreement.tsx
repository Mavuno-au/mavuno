import Link from "next/link";

const link = "text-primary hover:underline";

// What joining agrees to. Where an account can be made, it names the OpenAI
// safety check, since what a new member posts is sent to it (App Store 5.1.2).
export function Agreement({ joining = false }: { joining?: boolean }) {
  return (
    <p className="text-center text-sm text-ink-muted">
      By joining you agree to the <Link href="/rules" className={link}>community rules</Link>, <Link href="/terms" className={link}>terms</Link> and{" "}
      <Link href="/privacy" className={link}>privacy policy</Link>
      {joining ? ", including automatic safety checks by OpenAI on what new members post." : "."}
    </p>
  );
}
