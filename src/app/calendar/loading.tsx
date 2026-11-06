import { SkeletonDayCard, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="shell">
      <div className="screen-head">
        <div className="wordmark">Booktight</div>
      </div>
      <SkeletonLine width="35%" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 6,
          marginTop: 16,
        }}
      >
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: "1", borderRadius: "var(--radius-sm)" }} />
        ))}
      </div>
      <SkeletonDayCard rows={1} />
    </div>
  );
}
