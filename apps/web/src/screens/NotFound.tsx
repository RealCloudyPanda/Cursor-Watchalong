import { Button } from "@watchalong/ui/components/ui/button";
import { SiteLayout } from "../site/SiteLayout";

export function NotFound({ incompleteInvite }: { incompleteInvite?: boolean }) {
  if (incompleteInvite) {
    return (
      <SiteLayout>
        <section className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-32 text-center">
          <p className="font-mono text-sm text-primary">Invite link</p>
          <h1 className="text-3xl font-semibold tracking-tight">This invite link is incomplete</h1>
          <p className="text-muted-foreground">
            The end of the link (starting with #k=) is missing. Ask the host to send the whole link
            again, or copy it with the side panel's Copy button.
          </p>
        </section>
      </SiteLayout>
    );
  }
  return (
    <SiteLayout>
      <section className="mx-auto flex max-w-md flex-col items-center gap-4 px-5 py-32 text-center">
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="text-3xl font-semibold tracking-tight">This page doesn't exist</h1>
        <p className="text-muted-foreground">
          If you were sent an invite link, check that you copied all of it, including the part after
          #.
        </p>
        <Button asChild>
          <a href="/">Go to the homepage</a>
        </Button>
      </section>
    </SiteLayout>
  );
}
