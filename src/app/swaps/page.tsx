const carbSwaps = [
  ["100 g cooked rice", "150 g cooked potato"],
  ["100 g cooked rice", "130 g cooked sweet potato"],
  ["100 g cooked rice", "120 g cooked quinoa"],
  ["100 g cooked rice", "1 Ezekiel tortilla"],
  ["100 g cooked rice", "2 slices Ezekiel bread"],
  ["100 g cooked rice", "120 g cooked beans"],
  ["100 g cooked rice", "120 g cooked lentils"],
  ["100 g cooked rice", "1 medium banana"],
  ["100 g cooked rice", "3/4 cup cooked pasta"],
];

const proteinSwaps = [
  ["100 g chicken breast", "1 tuna can"],
  ["100 g chicken breast", "120 g tilapia"],
  ["100 g chicken breast", "220 g egg whites"],
  ["100 g chicken breast", "1 protein shake"],
  ["100 g chicken breast", "220 g cottage cheese"],
];

const fatSwaps = [
  ["10 g olive oil", "10 g avocado oil"],
  ["10 g olive oil", "60–70 g avocado"],
  ["10 g olive oil", "16 g peanut butter"],
  ["10 g olive oil", "40 g feta"],
  ["10 g olive oil", "2 boiled eggs"],
];

export default function SwapsPage() {
  return (
    <main className="app-shell">
      <div className="mx-auto max-w-5xl">
        <p className="eyebrow mb-2 text-xs font-semibold">Equal trade system</p>
        <h1 className="mb-4 text-4xl font-bold">Macro Swaps</h1>

        <SwapSection title="Carb Swaps" rows={carbSwaps} />
        <SwapSection title="Protein Swaps" rows={proteinSwaps} />
        <SwapSection title="Fat Swaps" rows={fatSwaps} />
      </div>
    </main>
  );
}

function SwapSection({
  title,
  rows,
}: {
  title: string;
  rows: string[][];
}) {
  return (
    <section className="surface mb-6 rounded-3xl p-5">
      <h2 className="text-xl font-semibold mb-3">{title}</h2>

      <div className="space-y-2">
        {rows.map(([from, to]) => (
          <div
            key={`${from}-${to}`}
            className="surface-strong grid gap-2 rounded-2xl p-3 md:grid-cols-2"
          >
            <div>
              <span className="muted">Instead of:</span>{" "}
              <strong>{from}</strong>
            </div>
            <div>
              <span className="muted">Use:</span>{" "}
              <strong>{to}</strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
