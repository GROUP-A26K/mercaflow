import { IconClockHour4, IconMail, IconWorld } from "@tabler/icons-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { JsonLd } from "@/components/seo/json-ld";
import { buildMetadata } from "@/lib/seo/metadata";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/lib/seo/config";
import { ContactForm } from "./_components/contact-form";

export const metadata = buildMetadata({
  title: "Contact",
  description:
    "Talk to the Mercaflow team about agentic product audits, the Fix Engine and making your catalog recommendable by AI.",
  path: "/contact",
});

// Email de contact public (distinct du destinataire interne du formulaire).
const PUBLIC_EMAIL = "jb@mercaflow.ai";

const details = [
  {
    icon: IconMail,
    label: "Email us",
    value: PUBLIC_EMAIL,
    href: `mailto:${PUBLIC_EMAIL}`,
  },
  {
    icon: IconClockHour4,
    label: "Response time",
    value: "Within one business day",
  },
  {
    icon: IconWorld,
    label: "Audit delivery",
    value: "Remote, in 72 hours",
  },
];

const proofAvatars = [12, 32, 5, 24];

const contactJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact",
  url: `${siteConfig.url}/contact`,
  isPartOf: { "@type": "WebSite", name: siteConfig.name, url: siteConfig.url },
};

export default function ContactPage() {
  return (
    <main className="relative isolate mx-auto w-full max-w-6xl flex-1 px-6 py-16 sm:py-24">
      <JsonLd data={webPageJsonLd({ name: "Contact", path: "/contact" })} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Contact", path: "/contact" },
        ])}
      />
      <JsonLd data={contactJsonLd} />

      <section className="mx-auto max-w-5xl">
        {/* Split card : moitié gauche teintée (pitch + coordonnées + preuve sociale),
            moitié droite le formulaire. Un seul panneau encadré, pas de double carte. */}
        <div className="glass-strong overflow-hidden rounded-3xl shadow-xl ring-1 shadow-foreground/5 ring-foreground/10 lg:grid lg:grid-cols-2">
          {/* Gauche */}
          <div className="relative isolate flex flex-col gap-8 border-b border-foreground/10 bg-muted/40 p-8 sm:p-10 lg:border-r lg:border-b-0">
            {/* Halo discret en fond */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-16 -left-16 -z-10 size-56 rounded-full bg-primary/5 blur-3xl"
            />

            <div>
              <Badge variant="outline" className="glass gap-1.5 py-1">
                <IconMail className="size-3.5 text-primary" />
                Contact
              </Badge>
              <h1 className="mt-6 max-w-[18ch] font-heading text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">
                Let&apos;s make your catalog{" "}
                <span className="text-muted-foreground">recommendable</span>
              </h1>
              <p className="mt-5 max-w-[46ch] text-lg text-pretty text-muted-foreground">
                Tell us about your catalog and the engines you care about. We
                will come back with how Mercaflow can help.
              </p>
            </div>

            <dl className="flex flex-col gap-5">
              {details.map((d) => (
                <div key={d.label} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/60 ring-1 ring-foreground/10">
                    <d.icon className="size-4.5 text-primary" />
                  </span>
                  <div>
                    <dt className="text-sm font-medium text-foreground">
                      {d.label}
                    </dt>
                    <dd className="text-sm text-muted-foreground">
                      {d.href ? (
                        <a
                          href={d.href}
                          className="underline-offset-4 hover:text-foreground hover:underline"
                        >
                          {d.value}
                        </a>
                      ) : (
                        d.value
                      )}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>

            {/* Preuve sociale */}
            <div className="mt-auto flex items-center gap-3 border-t border-foreground/10 pt-6">
              <div className="flex -space-x-2">
                {proofAvatars.map((img) => (
                  <Avatar key={img} className="size-8 ring-2 ring-background">
                    <AvatarImage
                      src={`https://i.pravatar.cc/64?img=${img}`}
                      alt=""
                    />
                    <AvatarFallback>·</AvatarFallback>
                  </Avatar>
                ))}
              </div>
              <p className="text-sm text-pretty text-muted-foreground">
                Trusted by 200+ Shopify Plus brands.
              </p>
            </div>
          </div>

          {/* Droite : formulaire */}
          <div className="flex flex-col gap-6 p-8 sm:p-10">
            <div>
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                Send us a message
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We reply to every request, usually within a day.
              </p>
            </div>
            <ContactForm />
          </div>
        </div>
      </section>
    </main>
  );
}
