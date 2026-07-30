import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-8 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>OSSPlay Dashboard</CardTitle>
          <CardDescription>
            Self-hosted object storage &amp; file management platform.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Infra scaffold — orgs, projects, and the drive browser land here next.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
