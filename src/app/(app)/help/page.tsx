import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page";
import { HELP_ARTICLES, HELP_CATEGORIES, helpHref } from "@/lib/help";
import { CONTACT_EMAIL } from "@/lib/site";
import { HelpSearch } from "./help-search";

export const metadata: Metadata = {
  title: "Help",
  description: "How Mavuno works: posting and review, reporting, suspensions and appeals, the age check, your data, and how to reach a person.",
};

export default function HelpPage() {
  return (
    <>
      <PageHeader title="Help" />
      <div className="grid gap-8 px-4 py-6 sm:px-6">
        <HelpSearch />

        {HELP_CATEGORIES.map((category) => (
          <section key={category.key} aria-labelledby={`help-${category.key}`} className="grid gap-2">
            <div>
              <h2 id={`help-${category.key}`} className="text-lg font-semibold tracking-tight">
                {category.title}
              </h2>
              <p className="text-sm text-ink-muted">{category.summary}</p>
            </div>
            <ul className="-mx-4 divide-y divide-hairline border-y border-hairline sm:-mx-6">
              {HELP_ARTICLES.filter((article) => article.category === category.key).map((article) => (
                <li key={article.slug}>
                  <Link href={helpHref(article.slug)} className="block px-4 py-3 hover:bg-wash sm:px-6">
                    <span className="block text-[15px] font-medium">{article.title}</span>
                    <span className="block text-sm text-ink-muted">{article.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <p className="text-[15px]">
          Still stuck? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
            {CONTACT_EMAIL}
          </a>
          . A person reads every message, and we aim to reply within 7 days.
        </p>
      </div>
    </>
  );
}
