'use client';

import { KeyRoundIcon } from 'lucide-react';
import { ComingSoon } from '@/components/instance/coming-soon';

export default function InstanceSshKeysPage() {
  return (
    <ComingSoon
      icon={KeyRoundIcon}
      title="SSH Keys"
      description="Generate or paste a keypair to connect to your remote servers."
    />
  );
}
