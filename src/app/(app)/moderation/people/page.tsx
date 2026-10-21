import { z } from "zod";
import { DecisionCard, LookupForm, PersonCard, SanctionList } from "@/components/moderation/people";
import { loadBannedIdentityCount, loadDecision, loadPersonHistory, loadSanctions } from "@/lib/data/moderation";
import { usernameSchema } from "@/lib/schemas";

export const metadata = { title: "People" };

// "@username" shows a person's history; a number looks up the decision an
// appeal is about.
const lookupSchema = z.union([
  z.coerce.number().int().positive().transform((decision) => ({ kind: "decision" as const, decision })),
  z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, "").toLowerCase())
    .pipe(usernameSchema)
    .transform((username) => ({ kind: "person" as const, username })),
]);

export default async function PeoplePage({ searchParams }: PageProps<"/moderation/people">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const lookup = query === "" ? null : lookupSchema.safeParse(query);
  const [sanctions, hashes] = await Promise.all([loadSanctions(), loadBannedIdentityCount()]);

  return (
    <>
      <LookupForm query={query} />
      {lookup?.success ? (
        lookup.data.kind === "decision" ? (
          <DecisionCard decision={await loadDecision(lookup.data.decision)} />
        ) : (
          <PersonCard history={await loadPersonHistory(lookup.data.username)} query={lookup.data.username} />
        )
      ) : lookup ? (
        <PersonCard history={null} query={query} />
      ) : null}
      <SanctionList sanctions={sanctions} hashes={hashes} />
    </>
  );
}
