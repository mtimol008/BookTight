import { SkeletonDayCard, SkeletonLine } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="shell">
      <div className="screen-head">
        <div className="wordmark">Booktight</div>
      </div>
      <SkeletonLine width="45%" />
      <SkeletonDayCard rows={2} />
      <SkeletonDayCard rows={1} />
    </div>
  );
}
