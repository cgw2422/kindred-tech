"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { InvoiceError } from "@/lib/billing/invoices";
import { failure, fd, type ActionState } from "@/lib/forms";
import { TechError } from "@/lib/tech/access";
import { createInvoiceForWorkOrder } from "@/lib/tech/admin-work-orders";

export async function createInvoiceFromWorkOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requirePermission("appointments:manage", "/admin/work-orders");
  const parsed = z.object({ workOrderId: z.string().trim().min(1).max(64) }).safeParse({ workOrderId: fd(formData, "workOrderId") });
  if (!parsed.success) return failure("Missing work order.");
  let invoiceId: string;
  try {
    const invoice = await createInvoiceForWorkOrder(parsed.data.workOrderId, user.id);
    invoiceId = invoice.id;
  } catch (err) {
    if (err instanceof TechError || err instanceof InvoiceError) return failure(err.message);
    console.error("[work-orders] create invoice failed", err);
    return failure("The invoice could not be created. Please try again.");
  }
  revalidatePath("/admin/work-orders");
  redirect(`/admin/invoices/${invoiceId}`);
}
