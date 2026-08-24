import Link from "next/link";

export default function NotFound() {
  return <div className="notice"><h1>Not found</h1><p>That listing does not exist or is no longer active.</p><Link href="/">Back to the board</Link></div>;
}
