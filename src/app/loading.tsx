import { LoadingState } from "@/components/ui/loading-state";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="poke-card p-5 sm:p-8">
        <LoadingState label="Loading page" rows={2} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="poke-card p-5">
          <LoadingState label="Loading current season" rows={4} />
        </div>
        <div className="poke-card p-5">
          <LoadingState label="Loading recent activity" rows={4} />
        </div>
      </div>
    </div>
  );
}
