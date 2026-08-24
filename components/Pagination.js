import Link from "next/link";

export default function Pagination({ page, pages }) {
  if (pages <= 1) return null;
  const values = [...new Set([1, page - 1, page, page + 1, pages].filter((value) => value >= 1 && value <= pages))];
  return (
    <nav className="pagination" aria-label="Leaderboard pages">
      {page > 1 && <Link href={`/?page=${page - 1}`}>Previous</Link>}
      {values.map((value, index) => (
        <span key={value} style={{ display: "contents" }}>
          {index > 0 && value - values[index - 1] > 1 && <span aria-hidden="true">…</span>}
          {value === page ? <span className="current" aria-current="page">{value}</span> : <Link href={`/?page=${value}`}>{value}</Link>}
        </span>
      ))}
      {page < pages && <Link href={`/?page=${page + 1}`}>Next</Link>}
    </nav>
  );
}
