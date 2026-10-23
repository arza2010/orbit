export function TodaySkeleton() {
  return (
    <div aria-busy aria-label="Loading today">
      <div className="pb-10 pt-2">
        <div className="skeleton mb-5 h-4 w-40" />
        <div className="skeleton mb-3 h-20 w-[min(34rem,90%)]" />
        <div className="skeleton h-20 w-[min(22rem,70%)]" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="flex flex-col gap-5">
          <div className="skeleton h-[250px] rounded-[24px]" />
          <div className="skeleton h-[420px] rounded-[24px]" />
        </div>
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[118px] rounded-[24px]" />
            ))}
          </div>
          <div className="skeleton h-[360px] rounded-[24px]" />
        </div>
      </div>
    </div>
  );
}
