import { NotFoundContent } from "./_components/NotFoundContent";

/** Used when notFound() is called inside a public page; the public layout supplies header, main, and footer. */
export default function PublicNotFound() {
  return <NotFoundContent />;
}
