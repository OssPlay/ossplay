'use client';

import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Me = {
  user: {
    name: string;
    email: string;
  };
};

export default function ProfilePage() {
  const { data: me } = useSWR<Me>('/auth/me');
  if (!me) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        <p>{me.user.name}</p>
        <p className="text-muted-foreground">{me.user.email}</p>
      </CardContent>
    </Card>
  );
}
