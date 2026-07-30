import type { Session, User } from '@ossplay/db';

export type AppEnv = {
  Variables: {
    user: User;
    session: Session;
  };
};
