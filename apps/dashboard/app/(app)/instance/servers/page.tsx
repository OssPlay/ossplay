'use client';

import { HardDriveIcon } from 'lucide-react';
import { ComingSoon } from '@/components/instance/coming-soon';

export default function InstanceServersPage() {
  return (
    <ComingSoon
      icon={HardDriveIcon}
      title="Remote Servers"
      description="Register a VPS to run a worker container against."
    />
  );
}
