import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Honest "not built yet" state for instance sections whose backend doesn't
// exist yet — same graceful-degradation spirit as the Caddy-unreachable and
// updater-unavailable messages elsewhere in this app, not a fabricated
// empty state pretending the feature works.
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        This section is being built — check back soon.
      </CardContent>
    </Card>
  );
}
