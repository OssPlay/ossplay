'use client';

import { ScrollTextIcon } from 'lucide-react';
import { ComingSoon } from '@/components/instance/coming-soon';

export default function InstanceAuditLogsPage() {
  return (
    <ComingSoon
      icon={ScrollTextIcon}
      title="Audit Logs"
      description="A record of instance-level actions taken by the root account."
    />
  );
}
