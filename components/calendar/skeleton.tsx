export function CalendarSkeleton() {
  return (
    <div aria-busy aria-label="Loading calendar">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <div className="skeleton mb-3 h-3 w-32" />
          <div className="skeleton h-14 w-72 max-w-[70vw]" />
        </div>
        <div className="skeleton hidden h-11 w-72 rounded-full md:block" />
      </div>
      <div className="glass p-5">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="skeleton h-[72px] rounded-2xl md:h-[116px]" />
          ))}
        </div>
      </div>
    </div>
  );
}
