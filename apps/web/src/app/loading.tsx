export default function Loading() {
  return (
    <main className="mx-auto min-h-[55vh] max-w-5xl px-6 py-12" aria-busy="true">
      <span className="sr-only">VoxScore</span>
      <div className="h-2 w-24 animate-pulse rounded-full bg-emerald-400 motion-reduce:animate-none" />
      <div className="mt-8 h-12 max-w-xl animate-pulse rounded-xl bg-neutral-800 motion-reduce:animate-none" />
      <div className="mt-4 h-5 max-w-md animate-pulse rounded-lg bg-neutral-900 motion-reduce:animate-none" />
      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="aspect-video animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900 motion-reduce:animate-none"
          />
        ))}
      </div>
    </main>
  );
}
