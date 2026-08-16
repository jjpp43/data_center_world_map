import Link from "next/link";
import type { Metadata } from "next";
import { EditorialShell, SectionHeader, sheetLink } from "@/components/editorial";

export const revalidate = 2_592_000;

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What datacenters.world collects when you browse the map or sign in with GitHub, who processes it, and how to ask for deletion.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Privacy · datacenters.world",
    description:
      "What we collect when you browse or sign in, who processes it, and how to ask for deletion.",
    type: "article",
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <EditorialShell>
        <h1 className="text-3xl font-semibold tracking-tight">Privacy</h1>
        <p className="mt-3 text-[15px] leading-7 text-zinc-600 dark:text-zinc-400">
            The map and facility catalog are public data about buildings, not people. This page
            covers the account and billing data we hold when you visit or sign in.
        </p>

        <section className="mt-16 max-w-2xl">
          <SectionHeader>Who is responsible</SectionHeader>
          <p className="mt-5 text-zinc-500">
            datacenters.world operates this site. For privacy requests, email{" "}
            <a
              href="mailto:info@datacenters.world"
              className="font-mono text-teal-800 underline decoration-teal-300/80 underline-offset-4 hover:decoration-teal-700 dark:text-teal-400"
            >
              info@datacenters.world
            </a>
            .
          </p>
        </section>

        <section className="mt-12 max-w-2xl">
          <SectionHeader>If you only browse</SectionHeader>
          <p className="mt-5 text-zinc-500">
            The public pages do not require an account. We set a first-party{" "}
            <span className="font-mono text-sm text-zinc-900 dark:text-zinc-50">dcw-theme</span>{" "}
            cookie so light/dark preference survives a reload. Map tiles come from Mapbox.
            We do not run ads, analytics SDKs, or sell browsing data.
          </p>
        </section>

        <section className="mt-12 max-w-2xl">
          <SectionHeader>If you sign in</SectionHeader>
          <p className="mt-5 text-zinc-500">
            Sign-in is GitHub OAuth through Supabase Auth. We request identity only — no repo
            access. GitHub sends us your GitHub user id, username, and email. We use that to
            create an account, issue API keys, enforce monthly quotas, and (if you start a paid
            plan) open a Polar checkout.
          </p>
          <p className="mt-4 text-zinc-500">
            After sign-in we store API keys (hashed at rest; the plaintext key is shown once),
            key names, and daily request counts. Polar receives your email if you start a Pro or
            Team trial; Polar is the merchant of record for those payments.
          </p>
        </section>

        <section className="mt-12 max-w-2xl">
          <SectionHeader>Processors</SectionHeader>
          <ul className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
            <Processor
              name="Supabase"
              role="Auth, Postgres, row-level security"
              href="https://supabase.com/privacy"
            />
            <Processor
              name="Vercel"
              role="Hosting and request logs"
              href="https://vercel.com/legal/privacy-policy"
            />
            <Processor
              name="GitHub"
              role="OAuth identity provider"
              href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
            />
            <Processor
              name="Polar"
              role="Checkout, invoices, and subscription portal"
              href="https://polar.sh/legal/privacy"
            />
            <Processor
              name="Mapbox"
              role="Map tiles and geocoding"
              href="https://www.mapbox.com/legal/privacy"
            />
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-zinc-500">
            Several of these run in the United States. Signing in or loading the map means that
            data may leave your country. We do not sell personal data or use it for advertising.
          </p>
        </section>

        <section className="mt-12 max-w-2xl">
          <SectionHeader>Retention and deletion</SectionHeader>
          <p className="mt-5 text-zinc-500">
            Account and API-key records stay for as long as the account exists. Daily usage
            totals stay so quotas reset correctly. Polar keeps payment records as required for
            tax.
          </p>
          <p className="mt-4 text-zinc-500">
            There is no self-serve account deletion yet. Email{" "}
            <a
              href="mailto:info@datacenters.world"
              className="font-mono text-teal-800 underline decoration-teal-300/80 underline-offset-4 hover:decoration-teal-700 dark:text-teal-400"
            >
              info@datacenters.world
            </a>{" "}
            from the address on the account and we will delete the Auth user, API keys, and
            usage rows, and ask Polar to drop the linked customer where they allow it. We may
            keep a minimal record of the request.
          </p>
        </section>

        <section className="mt-12 max-w-2xl">
          <SectionHeader>What this is not</SectionHeader>
          <p className="mt-5 text-zinc-500">
            Facility pages, the GeoJSON map, and the public API describe data centers, operators,
            networks, and IXPs. That catalog is compiled from PeeringDB, OpenStreetMap, and
            operator-published pages. It is not personal data about you.
          </p>
          <p className="mt-4 text-zinc-500">
            The site is not directed at children. If we change what we collect, we will update
            this page.
          </p>
        </section>

        <section className="mt-16">
          <Link href="/login" className={sheetLink}>
            Sign in
          </Link>
        </section>

        <section className="mt-16 border-t border-zinc-200 pt-6 text-sm text-zinc-500 dark:border-zinc-800">
          <p>
            Questions ·{" "}
            <a
              href="mailto:info@datacenters.world"
              className="font-mono text-teal-800 underline decoration-teal-300/80 underline-offset-2 hover:decoration-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
            >
              info@datacenters.world
            </a>{" "}
            · Not legal advice
          </p>
        </section>
    </EditorialShell>
  );
}

function Processor({
  name,
  role,
  href,
}: {
  name: string;
  role: string;
  href: string;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-teal-800 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
      >
        {name}
      </a>
      <span className="text-sm text-zinc-500">{role}</span>
    </li>
  );
}
