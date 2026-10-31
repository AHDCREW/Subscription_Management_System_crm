import Link from "next/link";
import Form from "next/form";
import type { Prisma } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PRODUCTS_PAGE_SIZE, PRODUCT_TYPES, isProductType, productTypeInfo } from "@/lib/catalog/product-types";
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { taxLabel } from "./tax-options";

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function ProductsPage({ searchParams }: PageProps<"/dashboard/products">) {
  const user = await requireTeam();
  const isAdmin = user.role === "ADMIN";

  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 160);
  const type = first(params.type);
  const typeFilter = isProductType(type) ? type : undefined;
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  // MySQL's default collation makes `contains` case-insensitive.
  const where: Prisma.ProductWhereInput = {
    ...(q && { name: { contains: q } }),
    ...(typeFilter && { type: typeFilter }),
  };

  const total = await db.product.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const products = await db.product.findMany({
    where,
    orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
    skip: (page - 1) * PRODUCTS_PAGE_SIZE,
    take: PRODUCTS_PAGE_SIZE,
    include: { tax: { select: { name: true, rate: true } }, _count: { select: { variants: true } } },
  });

  const filtered = Boolean(q || typeFilter);
  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (typeFilter) sp.set("type", typeFilter);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return qs ? `/dashboard/products?${qs}` : "/dashboard/products";
  };

  return (
    <>
      <PageHeader
        title="Products"
        description={isAdmin ? "Everything Brightloop sells." : "Everything Brightloop sells. View only."}
        actions={isAdmin && <ButtonLink href="/dashboard/products/new">New product</ButtonLink>}
      />

      <Form action="/dashboard/products" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" type="search" placeholder="Search by name…" defaultValue={q} className="w-64" aria-label="Search by name" />
        <Select name="type" defaultValue={typeFilter ?? ""} className="w-40" aria-label="Filter by type">
          <option value="">All types</option>
          {PRODUCT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <ButtonLink href="/dashboard/products" variant="ghost">
            Clear
          </ButtonLink>
        )}
      </Form>

      {products.length === 0 ? (
        <EmptyState
          message={filtered ? "No products match your filters." : "No products yet."}
          action={
            !filtered && isAdmin ? <ButtonLink href="/dashboard/products/new">Add your first product</ButtonLink> : undefined
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th className="text-right">Sales price</Th>
                <Th className="text-right">Cost price</Th>
                <Th>Default tax</Th>
                <Th className="text-right">Variants</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const info = productTypeInfo(p.type);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/dashboard/products/${p.id}`} className="font-medium text-indigo-600 hover:underline">
                        {p.name}
                      </Link>
                    </Td>
                    <Td>
                      <Badge tone={info.tone}>{info.label}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.salesPrice)}</Td>
                    <Td className="text-right tabular-nums">{formatMoney(p.costPrice)}</Td>
                    <Td>{p.tax ? taxLabel(p.tax) : <span className="text-slate-400">—</span>}</Td>
                    <Td className="text-right tabular-nums">{p._count.variants}</Td>
                    <Td>{p.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
            <p>
              Showing {(page - 1) * PRODUCTS_PAGE_SIZE + 1}–{(page - 1) * PRODUCTS_PAGE_SIZE + products.length} of {total}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <ButtonLink href={pageHref(page - 1)} variant="secondary">
                    Previous
                  </ButtonLink>
                ) : (
                  <Button variant="secondary" disabled>
                    Previous
                  </Button>
                )}
                <span>
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <ButtonLink href={pageHref(page + 1)} variant="secondary">
                    Next
                  </ButtonLink>
                ) : (
                  <Button variant="secondary" disabled>
                    Next
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
