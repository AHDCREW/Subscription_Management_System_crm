import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { MAX_OPEN_REQUESTS, requestsLeft } from "@/lib/subscriptions/quote-requests";
import { toDateInput, todayUtc } from "@/lib/subscriptions/subscriptions";
import { Alert, ButtonLink, EmptyState, PageHeader } from "@/components/kit";
import { countOpenRequests, getRequestCatalog } from "../data";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "Request a quotation" };

export default async function RequestQuotationPage({ searchParams }: PageProps<"/portal/products/request">) {
  const user = await requireCustomer();
  const today = todayUtc();
  const [catalog, openCount, params] = await Promise.all([getRequestCatalog(today), countOpenRequests(user.id), searchParams]);

  // ?template=ID from "Request this package"; ignored unless it is one of the packages on offer.
  const templateParam = Number(Array.isArray(params.template) ? params.template[0] : params.template);
  const initialTemplateId = catalog.templates.some((t) => t.id === templateParam) ? templateParam : null;
  const left = requestsLeft(openCount);

  return (
    <>
      <ButtonLink href="/portal/products" variant="ghost" className="mb-2 -ml-3 text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Products
      </ButtonLink>
      <PageHeader
        title="Request a quotation"
        description="Tell us what you need. Our team reviews it, confirms the prices and sends you a quotation."
      />

      {left === 0 ? (
        <Alert tone="amber">
          You already have {MAX_OPEN_REQUESTS} requests with our team. You can send another once we&apos;ve replied with a
          quotation, or after you withdraw one under Subscriptions.
        </Alert>
      ) : catalog.plans.length === 0 || catalog.products.length === 0 ? (
        <EmptyState message="Nothing is on sale right now, so there is nothing to request. Please check back soon." />
      ) : (
        <RequestForm catalog={catalog} initialTemplateId={initialTemplateId} today={toDateInput(today)} requestsLeft={left} />
      )}
    </>
  );
}
