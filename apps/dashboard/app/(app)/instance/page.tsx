'use client';

import { ServerIcon } from 'lucide-react';
import { ComingSoon } from '@/components/instance/coming-soon';

export default function InstanceOverviewPage() {
  return (
    <ComingSoon
      icon={ServerIcon}
      title="Web Server"
      description="Server IP, version info, and update checks land here."
    />
  );
}
