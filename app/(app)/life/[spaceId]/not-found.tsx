import Link from "next/link";

export default function SpaceNotFound() {
  return (
    <div className="glass mx-auto mt-24 max-w-md p-8 text-center">
      <h1 className="font-display text-3xl">No such space.</h1>
      <p className="mt-2 text-sm text-muted">It may have been archived, or the link is old.</p>
      <Link href="/life" className="mt-5 inline-block rounded-full border border-line bg-surface px-4 py-2 text-sm hover:bg-surface-2">
        Back to Life
      </Link>
    </div>
  );
}
