'use client';

import { MailIcon } from 'lucide-react';
import { SmtpForm } from '@/components/instance/smtp-form';
import Container from '@/components/ui/container';

export default function InstanceSmtpPage() {
  return (
    <Container
      header={{
        icon: MailIcon,
        title: 'SMTP',
        description: 'Used to send invitation and password-reset emails.',
      }}
    >
      <SmtpForm />
    </Container>
  );
}
