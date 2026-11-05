import type { AppointmentStatus, InvoiceStatus, MembershipStatus, PaymentStatus } from "@prisma/client";
import { Badge, type Tone } from "./ui";
import { STATUS_LABELS } from "@/lib/booking/status";

const apptTone: Record<AppointmentStatus, Tone> = {
  REQUESTED: "warn",
  CONFIRMED: "navy",
  ASSIGNED: "navy",
  EN_ROUTE: "green",
  IN_PROGRESS: "green",
  COMPLETED: "neutral",
  CANCELED: "danger",
  NO_SHOW: "danger",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return <Badge tone={apptTone[status]}>{STATUS_LABELS[status]}</Badge>;
}

const invoiceTone: Record<InvoiceStatus, Tone> = { DRAFT: "neutral", OPEN: "warn", PARTIALLY_PAID: "warn", PAID: "green", VOID: "neutral", REFUNDED: "danger" };
const invoiceLabel: Record<InvoiceStatus, string> = { DRAFT: "Draft", OPEN: "Unpaid", PARTIALLY_PAID: "Partially paid", PAID: "Paid", VOID: "Void", REFUNDED: "Refunded" };
export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={invoiceTone[status]}>{invoiceLabel[status]}</Badge>;
}

const paymentTone: Record<PaymentStatus, Tone> = { PENDING: "warn", SUCCEEDED: "green", FAILED: "danger", REFUNDED: "neutral", PARTIALLY_REFUNDED: "warn" };
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={paymentTone[status]}>{status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

const membershipTone: Record<MembershipStatus, Tone> = { PENDING: "warn", ACTIVE: "green", PAST_DUE: "danger", PAUSED: "neutral", CANCELED: "neutral" };
export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  return <Badge tone={membershipTone[status]}>{status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function humanize(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
