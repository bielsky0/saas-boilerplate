import { Button } from "@/components/ui";
import { signOutAction } from "../actions";

/**
 * Sign-out control. A server-action form so no client JS is required and the
 * session cookie is cleared server-side.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="ghost">
        Sign out
      </Button>
    </form>
  );
}
