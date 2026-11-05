import type { Metadata } from "next";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { Badge, Card, PageHeader, Select, Table, Td, TextInput, Th } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { humanize } from "@/components/status";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { formatDateTime } from "@/lib/time";
import { STAFF_ROLES } from "@/lib/admin/users";
import { ActionForm } from "../_config/ActionForm";
import { RowAction } from "../_config/RowAction";
import { changeRoleAction, createStaffUserAction, forceSignOutAction, setActiveAction } from "./actions";

export const metadata: Metadata = { title: "Users & Roles" };

const ROLE_HELP: Record<string, string> = {
  OWNER: "Everything, including users and roles.",
  ADMIN: "Everything except managing users.",
  DISPATCHER: "Appointments, customers, dispatch; view billing.",
  TECHNICIAN: "Technician portal: their own assigned visits.",
};
const ALL_ROLES: Role[] = ["OWNER", "ADMIN", "DISPATCHER", "TECHNICIAN", "CUSTOMER", "FACILITY_CONTACT"];

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requirePermission("users:manage", "/admin/users");
  const sp = await searchParams;
  const showCustomers = sp.all === "1";
  const tz = (await getSettings("business")).timeZone;
  const now = new Date();
  const users = await prisma.user.findMany({
    where: showCustomers ? {} : { role: { in: [...STAFF_ROLES] } },
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    take: 300,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      lockedUntil: true,
      _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
    },
  });
  const roleOptions = STAFF_ROLES.map((r) => ({ value: r, label: humanize(r) }));

  return (
    <div>
      <PageHeader title="Users & Roles" description="Staff accounts and what each role can do. Only owners can see this page." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div>
          <p className="mb-3">
            {showCustomers ? (
              <Link href="/admin/users">Show staff only</Link>
            ) : (
              <Link href="/admin/users?all=1">Also show customer and facility accounts</Link>
            )}
          </p>
          <Table caption="Users">
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === me.id;
                const staff = (STAFF_ROLES as readonly string[]).includes(u.role);
                return (
                  <tr key={u.id}>
                    <Td>
                      <span className="font-semibold">{u.name}</span>
                      {isMe && <span className="text-sm text-body"> (you)</span>}
                      <div className="text-sm text-body break-all">{u.email}</div>
                    </Td>
                    <Td>
                      {staff && !isMe ? (
                        <ActionForm action={changeRoleAction} inline className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={u.id} />
                          <label htmlFor={`role-${u.id}`} className="sr-only">
                            Role for {u.name}
                          </label>
                          <select id={`role-${u.id}`} name="role" defaultValue={u.role} className="rounded-md border-2 border-line px-2 py-1.5">
                            {roleOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <SubmitButton size="sm" variant="outline" pendingText="...">
                            Change
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        <Badge tone="navy">{humanize(u.role)}</Badge>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={u.isActive ? "green" : "neutral"}>{u.isActive ? "Active" : "Deactivated"}</Badge>
                        {u.lockedUntil && u.lockedUntil > now && <Badge tone="danger">Locked</Badge>}
                        {u._count.sessions > 0 && <Badge>{u._count.sessions} session(s)</Badge>}
                      </div>
                    </Td>
                    <Td className="text-sm">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, tz) : "Never"}</Td>
                    <Td>
                      {isMe ? (
                        <span className="text-sm text-body">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {u.isActive ? (
                            <RowAction action={setActiveAction} id={u.id} extra={{ active: "false" }} label="Deactivate" variant="ghost" confirm={`Deactivate ${u.name}? They will be signed out immediately.`} />
                          ) : (
                            <RowAction action={setActiveAction} id={u.id} extra={{ active: "true" }} label="Activate" variant="outline" />
                          )}
                          {u._count.sessions > 0 && <RowAction action={forceSignOutAction} id={u.id} label="Sign out" variant="ghost" confirm={`Sign ${u.name} out of all devices?`} />}
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <Card>
          <h2 className="mb-3 text-xl">Add a staff member</h2>
          <p className="mb-4 text-body">No password is set. They sign in using the email link at /login, and can set a password afterward.</p>
          <ActionForm action={createStaffUserAction} resetOnSuccess>
            <TextInput label="Full name" name="name" required autoComplete="off" />
            <TextInput label="Email address" name="email" type="email" required autoComplete="off" />
            <TextInput label="Phone" name="phone" type="tel" autoComplete="off" />
            <Select label="Role" name="role" required defaultValue="DISPATCHER" options={roleOptions} hint="Technicians also get a technician profile for scheduling." />
            <SubmitButton>Add user</SubmitButton>
          </ActionForm>
          <dl className="mt-6 space-y-2 text-sm">
            {STAFF_ROLES.map((r) => (
              <div key={r}>
                <dt className="font-bold text-navy">{humanize(r)}</dt>
                <dd>{ROLE_HELP[r]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <section className="mt-10" aria-labelledby="matrix">
        <h2 id="matrix" className="mb-3 text-xl">
          Role permissions
        </h2>
        <Table caption="Permissions by role">
          <thead>
            <tr>
              <Th>Permission</Th>
              {ALL_ROLES.map((r) => (
                <Th key={r} className="text-center">
                  {humanize(r)}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((p) => (
              <tr key={p}>
                <Td>
                  <code>{p}</code>
                </Td>
                {ALL_ROLES.map((r) => {
                  const has = ROLE_PERMISSIONS[r].includes(p);
                  return (
                    <Td key={r} className="text-center">
                      {has ? (
                        <span className="font-bold text-green-dark" aria-label="Yes">
                          ✓
                        </span>
                      ) : (
                        <span className="text-body/50" aria-label="No">
                          –
                        </span>
                      )}
                    </Td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
