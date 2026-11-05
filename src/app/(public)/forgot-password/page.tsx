import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { EmailLinkForm } from "../login/LoginForms";

export const metadata: Metadata = { title: "Reset Password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="container-site max-w-xl py-12">
      <h1 className="mb-2 text-3xl">Reset your password</h1>
      <p className="mb-6 text-lg">Enter your email address and we will send you a link to choose a new password.</p>
      <Card>
        <EmailLinkForm purpose="reset" />
      </Card>
    </div>
  );
}
