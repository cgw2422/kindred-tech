import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { homePathForRole } from "@/lib/auth/permissions";

export const metadata = { title: "Access Not Permitted", robots: { index: false } };

export default async function ForbiddenPage() {
  const user = await getSessionUser();
  return (
    <div className="container-site max-w-2xl py-16">
      <h1 className="mb-3 text-3xl">You do not have access to that page</h1>
      <p className="mb-6 text-lg">Your account does not have permission to view that area. If you believe this is a mistake, please contact the account owner.</p>
      <Link href={user ? homePathForRole(user.role) : "/"} className="font-semibold">
        Go to your home page
      </Link>
    </div>
  );
}
