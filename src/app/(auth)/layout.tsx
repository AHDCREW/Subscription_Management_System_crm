export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <p className="text-3xl font-bold tracking-tight text-indigo-600">SubFlow</p>
        <p className="mt-1 text-sm text-slate-500">Subscriptions and recurring billing in one place</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
