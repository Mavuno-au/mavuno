import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page";
import { Prose } from "@/components/ui/prose";
import { anchorFor, HELP_ARTICLES, HELP_CATEGORIES, helpArticle, helpHref } from "@/lib/help";
import { CONTACT_EMAIL } from "@/lib/site";
import { HELP_CONTENT } from "../articles";

export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: PageProps<"/help/[slug]">): Promise<Metadata> {
  const article = helpArticle((await params).slug);
  return article ? { title: `${article.title} · Help`, description: article.summary } : { title: "Help" };
}

export default async function HelpArticlePage({ params }: PageProps<"/help/[slug]">) {
  const article = helpArticle((await params).slug);
  if (!article) notFound();
  const content = HELP_CONTENT[article.slug];
  const category = HELP_CATEGORIES.find((item) => item.key === article.category);

  return (
    <>
      <PageHeader title={article.title} back="/help" meta={category?.title} />
      <Prose>
        {content.lead}

        {content.sections.length > 1 ? (
          <nav aria-labelledby="on-this-page" className="rounded-xl border border-hairline bg-wash px-4 py-3">
            <p id="on-this-page" className="text-sm font-semibold">
              On this page
            </p>
            <ul className="mt-1">
              {content.sections.map((section) => (
                <li key={section.heading}>
                  <a href={`#${anchorFor(section.heading)}`}>{section.heading}</a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {content.sections.map((section) => (
          <section key={section.heading} className="grid gap-3">
            <h2 id={anchorFor(section.heading)}>{section.heading}</h2>
            {section.body}
          </section>
        ))}

        <section className="mt-4 grid gap-2 border-t border-hairline pt-4">
          <h2>Related articles</h2>
          <ul>
            {content.related.map((slug) => (
              <li key={slug}>
                <Link href={helpHref(slug)}>{helpArticle(slug)?.title}</Link>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">
            Still need help? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </section>
      </Prose>
    </>
  );
}
