import { resolveAccount } from "@/lib/account-auth";
import { isAdminEmail } from "@/lib/admin-auth";

/**
 * True only for a request signed in with a VERIFIED EMAIL identity whose address is listed in
 * SG16_ADMIN_EMAILS. API tokens, passes and the owner header never make someone an operator here.
 */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const account = await resolveAccount(req);
  if (!account || account.authKind !== "identity") return false;
  return isAdminEmail(account.identity?.email ?? null);
}
