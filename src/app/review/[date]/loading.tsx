import { SkeletonLine, SkeletonRow } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="shell">
      <div className="screen-head screen-head--center">
        <SkeletonLine width="60%" />
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
