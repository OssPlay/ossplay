// The exact `<p role="alert">` error block that appeared identically ~16
// times across app/ before this existed.
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}
